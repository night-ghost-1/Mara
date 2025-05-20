import { MaraMap } from "../../../Common/MapAnalysis/MaraMap";
import { MaraResourceCluster } from "../../../Common/MapAnalysis/MaraResourceCluster";
import { MaraResourceType } from "../../../Common/MapAnalysis/MaraResourceType";
import { MaraPoint } from "../../../Common/MaraPoint";
import { MaraProductionRequest } from "../../../Common/MaraProductionRequest";
import { TargetExpandData } from "../../../Common/Settlement/TargetExpandData";
import { UnitComposition } from "../../../Common/UnitComposition";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { MaraUtils } from "../../../MaraUtils";
import { ProductionTaskState } from "../../ProductionTaskState";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";

export class ExpandBuildState extends ProductionTaskState {
    protected requestMiningOnInsufficientResources = false;
    
    private expandCenter: MaraPoint | null;
    private harvestersToOrder: UnitComposition = new Map<string, number>();
    private minedMinerals: Set<MaraResourceType> = new Set<MaraResourceType>();
    private targetExpand: TargetExpandData;

    constructor(task: SettlementSubcontrollerTask, settlementController: MaraSettlementController, targetExpand: TargetExpandData) {
        super(task, settlementController);
        this.targetExpand = targetExpand;
        this.expandCenter = null;
    }

    protected onEntry(): boolean {
        let center = this.calculateExpandCenter();
        
        if (!center) {
            return false;
        }
        else {
            let settlementLocation = this.settlementController.GetSettlementLocation()!;
            let path = MaraMap.GetShortestPath(settlementLocation.Center, center);

            if (!path && !settlementLocation.Center.EqualsTo(center)) {
                this.task.Debug(`Unable to build expand, location is not reachable`);
                return false;
            }
            
            this.expandCenter = center;
            return true;
        }
    }

    protected onExit(): void {
        if (this.expandCenter) {
            let expandUnits = MaraUtils.GetSettlementUnitsAroundPoint(
                this.expandCenter,
                Math.max(this.settlementController.Settings.ResourceMining.WoodcuttingRadius, this.settlementController.Settings.ResourceMining.MiningRadius),
                [this.settlementController.Settlement],
                (unit) => 
                    MaraUtils.IsMetalStockConfigId(unit.UnitCfgId) ||
                    MaraUtils.IsMineConfigId(unit.UnitCfgId) ||
                    MaraUtils.IsSawmillConfigId(unit.UnitCfgId)
            );
            
            if (expandUnits.length > 0 && this.isRemoteExpand(this.expandCenter)) {
                if ( 
                    !this.settlementController.Expands.find( 
                        (value) => {return value.EqualsTo(this.expandCenter!)} 
                    ) 
                ) {
                    this.settlementController.Expands.push(this.expandCenter);
                }
            }
        }
    }

    protected onTargetCompositionReached(): void {
        this.task.Complete(true);
    }

    protected onProductionTimeout(): void {
        this.task.Complete(false);
    }

    protected getProductionRequests(): Array<MaraProductionRequest> {
        let result = new Array<MaraProductionRequest>();
        
        this.harvestersToOrder = new Map<string, number>();

        if (
            this.targetExpand.ResourceType.findIndex(
                (value) => {return value == MaraResourceType.Gold || value == MaraResourceType.Metal}
            ) >= 0
        ) {
            result.push(...this.orderMiningProduction());
        }

        if (
            this.targetExpand.ResourceType.findIndex(
                (value) => {return value == MaraResourceType.Wood}
            ) >= 0
        ) {
            result.push(...this.orderWoodcuttingProduction());
        }

        if (
            this.targetExpand.ResourceType.findIndex(
                (value) => {return value == MaraResourceType.People}
            ) >= 0
        ) {
            result.push(...this.orderHousingProduction());
        }

        result.push(...this.orderHarvestersProduction());

        return result;
    }

    protected getProductionTimeout(): number | null {
        return this.settlementController.Settings.Timeouts.ExpandBuild;
    }

    private calculateExpandCenter(): MaraPoint | null {
        let targetResourceCluster = this.targetExpand.Cluster;
        let expandCenter: MaraPoint;

        if (targetResourceCluster) {
            expandCenter = targetResourceCluster.Center;
        }
        else {
            let settlementLocation = this.settlementController.GetSettlementLocation();

            if (settlementLocation) {
                expandCenter = new MaraPoint(settlementLocation.Center.X, settlementLocation.Center.Y);
            }
            else { //all is lost
                return null;
            }
        }

        this.task.Debug(`Expand center calculated: ${expandCenter.ToString()}`);
        return expandCenter;
    }

    private isRemoteExpand(expandCenter: MaraPoint): boolean {
        let settlementLocation = this.settlementController.GetSettlementLocation();

        if (settlementLocation) {
            let distance = MaraUtils.ChebyshevDistance(expandCenter, settlementLocation.Center);
            let radius = Math.max(
                this.settlementController.Settings.ResourceMining.MiningRadius,
                this.settlementController.Settings.ResourceMining.WoodcuttingRadius
            );

            return !settlementLocation.BoundingRect.IsPointInside(expandCenter) && distance > radius;
        }
        else {
            return false;
        }
    }

    private orderMineProduction(cluster: MaraResourceCluster, resourceType: MaraResourceType): Array<MaraProductionRequest> {
        if (this.minedMinerals.has(resourceType)) {
            this.task.Debug(`Resource type '${resourceType}' mining is already ordered`);
            return [];
        }
        
        let mineConfigs = MaraUtils.GetAllMineConfigIds(this.settlementController.Settlement);
        let cfgId = this.settlementController.ProductionController.SelectConfigIdToProduce(mineConfigs);

        if (cfgId == null) {
            this.task.Debug(`Unable to order mine production: no mine config available`);
            return [];
        }
        
        let minePosition: MaraPoint | null = this.settlementController.MiningController.FindMinePosition(
            cluster, 
            cfgId,
            resourceType
        );

        if (!minePosition) {
            this.task.Debug(`Unable to order mine production: no suitable place for mine found`);
            return [];
        }

        let mineRequest = this.makeProductionRequest(cfgId, minePosition, 0, true);

        let mineConfigHeight = MaraUtils.GetConfigIdHeight(cfgId);
        let mineConfigWidth = MaraUtils.GetConfigIdWidth(cfgId);
        
        let mineResources = this.settlementController.MiningController.GetRectResources(
            minePosition,
            new MaraPoint(minePosition.X + mineConfigWidth - 1, minePosition.Y + mineConfigHeight - 1)
        );

        if (mineResources.Gold > 0) {
            this.minedMinerals.add(MaraResourceType.Gold);
        }

        if (mineResources.Metal > 0) {
            this.minedMinerals.add(MaraResourceType.Metal);
        }

        let harvesterConfigs = MaraUtils.GetAllHarvesterConfigIds(this.settlementController.Settlement);
        cfgId = this.settlementController.ProductionController.SelectConfigIdToProduce(harvesterConfigs);

        if (cfgId == null) {
            this.task.Debug(`Unable to order mine production: no harvester config available`);
            return [];
        }

        MaraUtils.AddToMapItem(this.harvestersToOrder, cfgId, this.settlementController.Settings.ResourceMining.MinMinersPerMine);

        return [mineRequest];
    }

    private orderMiningProduction(): Array<MaraProductionRequest> {
        let result = new Array<MaraProductionRequest>();
        
        let targetExpand = this.targetExpand;

        if (targetExpand.ResourceType.findIndex((value) => {return value == MaraResourceType.Gold}) >= 0) {
            result.push(...this.orderMineProduction(targetExpand.Cluster!, MaraResourceType.Gold));
        }

        if (targetExpand.ResourceType.findIndex((value) => {return value == MaraResourceType.Metal}) >= 0) {
            result.push(...this.orderMineProduction(targetExpand.Cluster!, MaraResourceType.Metal));
        }
        
        let metalStocks = MaraUtils.GetSettlementUnitsAroundPoint(
            this.expandCenter!, 
            this.settlementController.Settings.ResourceMining.MiningRadius,
            [this.settlementController.Settlement],
            (unit) => {return MaraUtils.IsMetalStockConfigId(unit.UnitCfgId) && unit.UnitIsAlive}
        );

        if (metalStocks.length == 0) {
            let metalStockConfigs = MaraUtils.GetAllMetalStockConfigIds(this.settlementController.Settlement);
            let cfgId = this.settlementController.ProductionController.SelectConfigIdToProduce(metalStockConfigs);

            if (cfgId == null) {
                this.task.Debug(`Unable to order mining production: no metal stock config available`);
                return result;
            }

            result.push(this.makeProductionRequest(cfgId, this.expandCenter, null, true));
        }

        return result;
    }
    
    private orderWoodcuttingProduction(): Array<MaraProductionRequest> {
        let result = new Array<MaraProductionRequest>();
        
        let isSawmillPresent = false;

        for (let sawmillData of this.settlementController.MiningController.Sawmills) {
            let distance = MaraUtils.ChebyshevDistance(sawmillData.Sawmill!.UnitRect.Center, this.expandCenter!);
            
            if (distance < this.settlementController.Settings.ResourceMining.WoodcuttingRadius) {
                isSawmillPresent = true;
                break;
            }
        }

        let targetResourceCluster = this.targetExpand.Cluster!;

        if (!isSawmillPresent) {
            let sawmillConfigs = MaraUtils.GetAllSawmillConfigIds(this.settlementController.Settlement);
            let cfgId = this.settlementController.ProductionController.SelectConfigIdToProduce(sawmillConfigs);

            if (cfgId == null) {
                this.task.Debug(`Unable to order woodcutting production: no sawmill config available`);
                return [];
            }

            result.push(this.makeProductionRequest(cfgId, targetResourceCluster.Center, null, true));
        }

        let harvesterConfigs = MaraUtils.GetAllHarvesterConfigIds(this.settlementController.Settlement);
        let cfgId = this.settlementController.ProductionController.SelectConfigIdToProduce(harvesterConfigs);

        if (cfgId == null) {
            this.task.Debug(`Unable to order woodcutting production: no harvester config available`);
            return [];
        }

        MaraUtils.AddToMapItem(this.harvestersToOrder, cfgId, this.settlementController.Settings.ResourceMining.WoodcutterBatchSize);

        return result;
    }

    private orderHousingProduction(): Array<MaraProductionRequest> {
        let result = new Array<MaraProductionRequest>();
        
        let housingConfigs = MaraUtils.GetAllHousingConfigIds(this.settlementController.Settlement);
        let cfgId = this.settlementController.ProductionController.SelectConfigIdToProduce(housingConfigs);
        
        if (cfgId == null) {
            this.task.Debug(`Unable to order housing production: no housing config available`);
            return [];
        }

        for (let i = 0; i < this.settlementController.Settings.ResourceMining.HousingBatchSize; i++) {
            result.push(this.makeProductionRequest(cfgId, null, null, true, this.settlementController.Settings.Priorities.HousingProduction));
        }

        return result;
    }

    private orderHarvestersProduction(): Array<MaraProductionRequest> {
        let result = new Array<MaraProductionRequest>();
        
        let freeHarvesters = this.settlementController.MiningController.GetFreeHarvesters();
        let freeHarvestersCount = freeHarvesters.length;

        this.harvestersToOrder.forEach(
            (value, key) => {
                let harvesterCount = Math.max(value - freeHarvestersCount, 0);

                for (let i = 0; i < harvesterCount; i++) {
                    result.push(this.makeProductionRequest(key, null, null, true, this.settlementController.Settings.Priorities.HarvesterProduction));
                }

                freeHarvestersCount = Math.max(freeHarvestersCount - value, 0);
            }
        );

        return result;
    }
}