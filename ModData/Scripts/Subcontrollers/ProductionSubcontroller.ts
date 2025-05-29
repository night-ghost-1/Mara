
import { MaraSettlementController } from "../MaraSettlementController";
import { MaraProductionRequestItem } from "../Common/MaraProductionRequestItem";
import { MaraUtils } from "../MaraUtils";
import { MaraSubcontroller } from "./MaraSubcontroller";
import { enumerate, eNext } from "library/dotnet/dotnet-utils";
import { MaraUnitCacheItem } from "../Common/Cache/MaraUnitCacheItem";
import { MaraRepairRequest } from "../Common/MaraRepairRequest";
import { SettlementClusterLocation } from "../Common/Settlement/SettlementClusterLocation";
import { MaraRect } from "../Common/MaraRect";
import { MaraUnitConfigCache } from "../Common/Cache/MaraUnitConfigCache";
import { MaraResources } from "../Common/MapAnalysis/MaraResources";
import { MaraUnitCache } from "../Common/Cache/MaraUnitCache";
import { MaraProductionRequest } from "../Common/MaraProductionRequest";
import SortedSet from "../Common/SortedSet.js";
import InsertConflictResolvers from "../Common/SortedSet/InsertConflictResolvers.js"
import { MaraPriority } from "../Common/MaraPriority";

type MotionBuildSelf = HordeClassLibrary.UnitComponents.OrdersSystem.Motions.Producing.MotionBuildSelf;

export class ProductionSubcontroller extends MaraSubcontroller {
    private queuedRequests: SortedSet;
    private queueOptions: any;

    private executingRequestItems: Array<MaraProductionRequestItem> = [];
    private repairRequests: Array<MaraRepairRequest> = [];
    private productionIndex: Map<string, Array<MaraUnitCacheItem>> | null = null;
    private producers: Array<MaraUnitCacheItem> = [];

    constructor (parent: MaraSettlementController) {
        super(parent);
        
        let allUnits = MaraUtils.GetAllSettlementUnits(this.settlementController.Settlement);

        for (let unit of allUnits) {
            if (MaraUtils.IsProducerConfigId(unit.UnitCfgId)) {
                this.producers.push(unit);
            }
        }

        this.queueOptions = {};
        
        this.queueOptions.comparator = (a: MaraProductionRequest, b: MaraProductionRequest) => {
            let priorityCompareResult = -(a.Priority - b.Priority);
            
            if (isNaN(priorityCompareResult) || priorityCompareResult == 0) {
                return a.Id - b.Id;
            }
            else  {
                return priorityCompareResult;
            }
        }

        this.queueOptions.onInsertConflict = InsertConflictResolvers.OnInsertConflictIgnore;

        this.queuedRequests = new SortedSet(this.queueOptions);
    }

    private get productionCfgIdList(): Array<string> {
        let list: Array<string> = [];

        let queuedRequestsArr = this.queuedRequests.toArray() as MaraProductionRequest[];
        
        for (let request of queuedRequestsArr) {
            let itemsCfgIds = request.Items.map((i: MaraProductionRequestItem) => i.ConfigId);
            list.push(...itemsCfgIds);
        }

        let masterMind = this.settlementController.MasterMind;
        let requests = enumerate(masterMind.Requests);
        let request;

        while ((request = eNext(requests) as any) !== undefined) {
            if (request!.RequestedCfg) {
                list.push(request.RequestedCfg.Uid);
            }
        }
        
        return list;
    }

    Tick(tickNumber: number): void {
        if (tickNumber % 10 != 0) {
            return;
        }

        if (tickNumber % 50 == 0) {
            this.cleanupUnfinishedBuildings(tickNumber);
            this.cleanupRepairRequests();
            this.repairUnits();
        }

        this.productionIndex = null;
        let incompleteRequests = new SortedSet(this.queueOptions);
        
        let iterator = this.queuedRequests.beginIterator();
        let highestRequestPriority = -Infinity;

        while (iterator != null) {
            let request = iterator.value() as MaraProductionRequest;
            iterator = iterator.next();

            if (!request) {
                continue;
            }

            if (request.IsCompleted || (request.IsCancelled && !request.IsExecuting)) {
                this.finalizeProductionRequest(request);
            }
            else {
                incompleteRequests.insert(request);

                if (request.IsCancelled) {
                    continue;
                }

                if (request.Priority > highestRequestPriority) {
                    highestRequestPriority = request.Priority;
                }

                if (!request.IsExecuting && request.Priority == highestRequestPriority) {
                    let nextProductionItem = request.Items.find((i) => !i.IsCompleted)!;

                    if (!request.Executor || !request.Executor.UnitIsAlive) {
                        let freeProducer = this.getProducer(nextProductionItem.ConfigId);
                
                        if (freeProducer) {
                            request.Executor = freeProducer;
                        }
                        else {
                            continue;
                        }
                    }

                    if (MaraUtils.RequestMasterMindProduction(nextProductionItem, request.Executor, this.settlementController.MasterMind)) {
                        this.Debug(`Added ${nextProductionItem.ConfigId} to MM queue, producer: ${request.Executor!.Unit.ToString()}`);
                        this.executingRequestItems.push(nextProductionItem);
                        this.settlementController.ReservedUnitsData.ReserveUnit(request.Executor);
                    }
                }
            }
        }

        this.queuedRequests = incompleteRequests;

        let filteredExecutingItems: Array<MaraProductionRequestItem> = [];

        for (let item of this.executingRequestItems) {
            if (item.IsCompleted) {
                item.OnProductionFinished();
                this.Debug(`Request ${item.ToString()} is completed with result ${item.IsSuccess}`);

                if (!item.IsSuccess) {
                    for (let otherItem of item.ParentRequest.Items) {
                        if (!otherItem.IsCompleted) {
                            otherItem.ForceFail();
                        }
                    }
                }
            }
            else {
                filteredExecutingItems.push(item);
            }
        }

        this.executingRequestItems = filteredExecutingItems;
    }

    RequestProduction(request: MaraProductionRequest): void {
        this.queuedRequests.insert(request);
        this.Debug(`Added ${request.ToString()} to target production list`);

        if (request.IsForce) {
            for (let item of request.Items) {
                this.requestAbsentProductionChainItemsProduction(item.ConfigId, request.Priority);
            }
        }
    }

    RequestSingleCfgIdProduction(configId: string, priority: MaraPriority): MaraProductionRequest | null {
        if (this.productionCfgIdList.indexOf(configId) < 0) {
            return this.requestCfgIdProduction(configId, priority);
        }
        else {
            return null;
        }
    }

    ForceRequestSingleCfgIdProduction(configId: string, priority: MaraPriority): Array<MaraProductionRequest> {
        if (!this.productionIndex) {
            this.updateProductionIndex();
        }
        
        let producers = this.productionIndex!.get(configId);
        
        let producersCount = 0;

        if (producers) {
            producersCount = producers.length;
        }
        else {
            producersCount = 1;
        }

        let orderedCfgIdsCount = 0;
        
        for (let orderedCfgId of this.productionCfgIdList) {
            if (orderedCfgId == configId) {
                orderedCfgIdsCount ++;
            }
        }
        
        if (orderedCfgIdsCount >= producersCount) {
            return [];
        }
        
        let request = this.requestCfgIdProduction(configId, priority);
        let chain = this.requestAbsentProductionChainItemsProduction(configId, priority);

        return [request, ...chain];
    }

    GetProduceableCfgIds(): Array<string> {
        if (!this.productionIndex) {
            this.updateProductionIndex();
        }
        
        return Array.from(this.productionIndex!.keys());
    }

    GetProducingCfgIds(cfgId: string): Array<string> {
        if (!this.productionIndex) {
            this.updateProductionIndex();
        }
        
        let producers = this.productionIndex!.get(cfgId);

        if (producers) {
            let cfgIds = new Set<string>();
            
            for (let producer of producers) {
                cfgIds.add(producer.UnitCfgId);
            }

            return Array.from(cfgIds);
        }
        else {
            return [];
        }
    }

    OnUnitListChanged(unit: MaraUnitCacheItem, isAdded: boolean): void {
        let cacheItem = MaraUnitCache.GetUnitById(unit.UnitId);

        if (!cacheItem) {
            return;
        }

        if (!MaraUtils.IsProducerConfigId(cacheItem.UnitCfgId)) {
            return;
        }
        
        if (isAdded) {
            this.producers.push(cacheItem);
        }
        else {
            this.producers = this.producers.filter((p) => p.UnitId != cacheItem.UnitId);
        }
    }

    IsCfgIdProduceable(cfgId: string): boolean {
        let allProduceableCfgIds = this.GetProduceableCfgIds();
        
        return allProduceableCfgIds.findIndex((c) => c == cfgId) >= 0;
    }

    SelectConfigIdToProduce(configIds: Array<string>): string | null {
        let economy = this.settlementController.GetCurrentDevelopedEconomyComposition();
        let allowedItems = MaraUtils.MakeAllowedCfgItems(configIds, economy, this.settlementController.Settlement);
        
        let allowedCfgIds: Array<string> = [];

        for (let item of allowedItems) {
            if (item.MaxCount > 0) {
                allowedCfgIds.push(item.UnitConfigId);
            }
        }
        
        return MaraUtils.RandomSelect<string>(this.settlementController.MasterMind, allowedCfgIds);
    }

    private finalizeProductionRequest(request: MaraProductionRequest): void {
        if (request.Executor) {
            this.settlementController.ReservedUnitsData.FreeUnit(request.Executor);
            request.Executor = null;
        }
    }

    private requestCfgIdProduction(configId: string, priority: MaraPriority): MaraProductionRequest {
        let item = new MaraProductionRequestItem(configId, null, null);
        let request = new MaraProductionRequest([item], priority)
        
        this.queuedRequests.insert(request);
        this.Debug(`Added ${configId} to target production list with priority ${request.Priority}`);

        return request;
    }

    private requestAbsentProductionChainItemsProduction(configId: string, priority: MaraPriority): Array<MaraProductionRequest> {
        let requiredConfigs = MaraUtils.GetCfgIdProductionChain(configId, this.settlementController.Settlement);
        
        let existingUnits = MaraUtils.GetAllSettlementUnits(this.settlementController.Settlement);
        let existingCfgIds = new Set<string>();

        for (let unit of existingUnits) {
            existingCfgIds.add(unit.UnitCfgId);
        }

        let result: Array<MaraProductionRequest> = [];
        
        for (let cfg of requiredConfigs) {
            if (!existingCfgIds.has(cfg.Uid) && !this.productionCfgIdList.find((value) => {return value == cfg.Uid})) {
                let request = this.requestCfgIdProduction(cfg.Uid, priority);
                result.push(request);
            }
        }

        return result;
    }

    private cleanupUnfinishedBuildings(tickNumber: number): void {
        let allUnits = MaraUtils.GetAllSettlementUnits(this.settlementController.Settlement);
        let unfinishedBuildings = allUnits.filter((u) => MaraUtils.IsBuildingConfigId(u.UnitCfgId) && u.Unit.EffectsMind.BuildingInProgress);
        
        for (let building of unfinishedBuildings) {
            // 2 is needed since units are processed every second tick in the core logic
            let lastBuildingTick = (building.Unit.OrdersMind.ActiveMotion as MotionBuildSelf).LastBuildTick * 2;

            if (lastBuildingTick) {
                if (tickNumber - lastBuildingTick > this.settlementController.Settings.Timeouts.UnfinishedConstructionThreshold) {
                    MaraUtils.IssueSelfDestructCommand([building], this.settlementController.Player);
                }
            }
        }
    }

    private repairUnits(): void {
        let repairZones = this.getRepairZones();
        
        let unitsToRepair: Array<MaraUnitCacheItem> = this.getUnitsToRepair(repairZones);
        
        let availableResources = this.settlementController.MiningController.GetStashedResourses();
        
        for (let unit of unitsToRepair) {
            let maxHealth = MaraUtils.GetConfigIdMaxHealth(unit.UnitCfgId);
            let missingHealth = unit.UnitHealth - maxHealth;

            let repairPrice = MaraUnitConfigCache.GetConfigProperty(
                unit.UnitCfgId, 
                (cfg) => {
                    let cost = this.settlementController.Settlement.Production.GetOneRepairContributionCost(cfg, 1)
                    return new MaraResources(cost.Lumber, cost.Metal, cost.Gold, cost.People)
                },
                "configIdRepairPrice"
            ) as MaraResources;

            let repairCost = repairPrice.Multiply(missingHealth);

            if (availableResources.IsGreaterOrEquals(repairCost)) {
                let repairer = this.getRepairer();
                
                if (repairer) {
                    let repairRequest = new MaraRepairRequest(unit, repairer);
                    this.settlementController.ReservedUnitsData.ReserveUnit(repairer);
                    MaraUtils.IssueRepairCommand([repairer], this.settlementController.Player, unit.UnitCell);

                    this.repairRequests.push(repairRequest);
                    this.Debug(`Created repair request: ${repairRequest.ToString()}`);
                }
            }
        }
    }

    private getRepairZones(): Array<SettlementClusterLocation> {
        let result: Array<SettlementClusterLocation> = [];

        let settlementLocation = this.settlementController.GetSettlementLocation();

        if (settlementLocation) {
            result.push(settlementLocation);
        }
        else {
            return [];
        }
        
        for (let expandPoint of this.settlementController.Expands) {
            let expandRect = MaraRect.CreateFromPoint(
                expandPoint, 
                this.settlementController.Settings.UnitSearch.ExpandEnemySearchRadius
            );

            let expandLocation = new SettlementClusterLocation(
                expandPoint,
                expandRect
            );

            result.push(expandLocation);
        }

        return result;
    }

    private getUnitsToRepair(repairZones: Array<SettlementClusterLocation>): Array<MaraUnitCacheItem> {
        let result: Array<MaraUnitCacheItem> = [];

        for (let zone of repairZones) {
            let zoneReparableUnits = MaraUtils.GetSettlementUnitsInArea(
                zone.BoundingRect,
                [this.settlementController.Settlement],
                (unit) => {
                    return (
                        MaraUtils.IsReparableConfigId(unit.UnitCfgId) &&
                        !unit.Unit.EffectsMind.BuildingInProgress
                    )
                },
                false
            );

            for (let unit of zoneReparableUnits) {
                if (unit.UnitHealth < MaraUtils.GetConfigIdMaxHealth(unit.UnitCfgId)) {
                    result.push(unit);
                }
            }
        }

        result = result.filter(
            (u) => !this.repairRequests.find(
                (r) => r.Target.UnitId == u.UnitId
            )
        );

        return result;
    }

    private cleanupRepairRequests(): void {
        let filteredRequests: Array<MaraRepairRequest> = [];

        for (let request of this.repairRequests) {
            if (
                !request.Executor.UnitIsAlive ||
                !request.Target.UnitIsAlive ||
                request.Executor.Unit.OrdersMind.OrdersCount == 0
            ) {
                this.finalizeRepairRequest(request);
            }
            else {
                filteredRequests.push(request);
            }
        }

        this.repairRequests = filteredRequests;
    }

    private finalizeRepairRequest(request: MaraRepairRequest): void {
        this.Debug(`Finalized repair request: ${request.ToString()}`);
        this.settlementController.ReservedUnitsData.FreeUnit(request.Executor);
    }

    private getProducer(configId: string): MaraUnitCacheItem | null {
        if (!this.productionIndex) {
            this.updateProductionIndex();
        }

        let producers = this.productionIndex!.get(configId);

        if (producers) {
            for (let producer of producers) {
                if (
                    producer.Unit.OrdersMind.OrdersCount == 0 &&
                    !this.settlementController.ReservedUnitsData.IsUnitReserved(producer)
                ) {
                    return producer;
                }
            }

            for (let i = 0; i < this.settlementController.ReservedUnitsData.ReservableUnits.length; i++) {
                for (let producer of producers) {
                    if (this.settlementController.ReservedUnitsData.ReservableUnits[i].has(producer.UnitId)) {
                        return producer;
                    }
                }
            }
        }

        return null;
    }

    private getRepairer(): MaraUnitCacheItem | null {
        let allUnits = MaraUtils.GetAllSettlementUnits(this.settlementController.Settlement);
        let allRepairers = allUnits.filter((u) => MaraUtils.IsRepairerConfigId(u.UnitCfgId) && u.UnitIsAlive);

        for (let repairer of allRepairers) {
            if (
                repairer.Unit.OrdersMind.OrdersCount == 0 &&
                !this.settlementController.ReservedUnitsData.IsUnitReserved(repairer)
            ) {
                return repairer;
            }
        }

        for (let i = 0; i < this.settlementController.ReservedUnitsData.ReservableUnits.length; i++) {
            for (let repairer of allRepairers) {
                if (this.settlementController.ReservedUnitsData.ReservableUnits[i].has(repairer.UnitId)) {
                    return repairer;
                }
            }
        }

        return null;
    }

    private updateProductionIndex(): void {
        this.productionIndex = new Map<string, Array<MaraUnitCacheItem>>();
        
        let producers = MaraUtils.GetAllSettlementUnits(this.settlementController.Settlement);
        producers = producers.filter((unit) => unit.UnitIsAlive && !unit.Unit.EffectsMind.BuildingInProgress);

        let requirementsCache = new Map<string, boolean>();
        
        for (let unit of producers) {
            let possibleProduceableCfgIds = MaraUtils.GetConfigIdProducedConfigIds(unit.UnitCfgId);

            let produceableCfgIds = possibleProduceableCfgIds.filter((cfgId) => {
                if (!requirementsCache.has(cfgId)) {
                    let unitConfig = MaraUtils.GetUnitConfig(cfgId);
                    let isCfgIdProduceable = this.configProductionRequirementsMet(unitConfig);

                    requirementsCache.set(cfgId, isCfgIdProduceable);
                    
                    return isCfgIdProduceable;
                }
                else {
                    return requirementsCache.get(cfgId);
                }
            });
            
            for (let cfgId of produceableCfgIds!) {
                if (this.productionIndex.has(cfgId)) {
                    let producers = this.productionIndex.get(cfgId);
                    producers!.push(unit);
                }
                else {
                    this.productionIndex.set(cfgId, [unit]);
                }
            }
        }
    }

    private configProductionRequirementsMet(config: any): boolean {
        return this.settlementController.Settlement.TechTree.HasUnmetRequirements(config);
    }
}