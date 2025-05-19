import { MaraSettlementController } from "../MaraSettlementController";
import { MaraTaskableSubcontroller } from "./MaraTaskableSubcontroller";
import { SettlementSubcontrollerTask } from "../SettlementSubcontrollerTasks/SettlementSubcontrollerTask";
import { MaraUtils } from "../MaraUtils";
import { UnitComposition } from "../Common/UnitComposition";
import { DevelopSettlementTask } from "../SettlementSubcontrollerTasks/DevelopmentSubcontroller/DevelopSettlementTask/DevelopSettlementTask";
import { MaraPoint } from "../Common/MaraPoint";
import { DefenceBuildTask } from "../SettlementSubcontrollerTasks/DevelopmentSubcontroller/DefenceBuildTask/DefenceBuildTask";

export class DevelopmentSubcontroller extends MaraTaskableSubcontroller {
    protected onTaskSuccess(tickNumber: number): void {
        this.nextTaskAttemptTick = tickNumber + MaraUtils.Random(
            this.settlementController.MasterMind,
            this.settlementController.Settings.Timeouts.SettlementEnhanceMaxCooldown,
            this.settlementController.Settings.Timeouts.SettlementEnhanceMinCooldown
        );
    }

    protected onTaskFailure(tickNumber: number): void {
        this.nextTaskAttemptTick = tickNumber + MaraUtils.Random(
            this.settlementController.MasterMind,
            60 * 50
        );
    }

    constructor (parent: MaraSettlementController) {
        super(parent);
    }

    protected doRoutines(tickNumber: number): void {
        //do nothing
    }

    protected makeSelfTask(tickNumber: number): SettlementSubcontrollerTask | null {
        let taskCandidates = new Array<SettlementSubcontrollerTask>();
        
        let settlementDevelopTask = this.makeSettlementDevelopTask();

        if (settlementDevelopTask) {
            taskCandidates.push(settlementDevelopTask);
        }
        
        let defenceBuildTask = this.makeDefenceBuildTask();

        if (defenceBuildTask) {
            taskCandidates.push(defenceBuildTask);
        }

        if (taskCandidates.length > 0) {
            return MaraUtils.RandomSelect(this.settlementController.MasterMind, taskCandidates);
        }
        else {
            this.nextTaskAttemptTick = tickNumber + MaraUtils.Random(
                this.settlementController.MasterMind,
                this.settlementController.Settings.Timeouts.DefaultTaskReattemptMaxCooldown
            );

            return null;
        }
    }

    private makeSettlementDevelopTask(): SettlementSubcontrollerTask | null {
        let economyComposition = this.settlementController.GetCurrentEconomyComposition();
        let produceableCfgIds = this.settlementController.ProductionController.GetProduceableCfgIds();

        let shortestUnavailableChain = this.getShortestUnavailableChain(economyComposition, produceableCfgIds);

        let selectedCfgIds: Array<string> | null = null;
    
        if (shortestUnavailableChain) {
            selectedCfgIds = shortestUnavailableChain;
        }
        else {
            this.Debug(`All strategy production chains are unlocked, proceeding to enhance settlement`);
            
            let economyBoosterChain: Array<string> = this.getEconomyBoosterAndChain(economyComposition);
            this.Debug(`Economy boosters & chain: ${economyBoosterChain.join(", ")}`);

            let healerChain: Array<string> = this.getHealerAndChain(economyComposition);
            this.Debug(`Healers & chain: ${healerChain.join(", ")}`);
            
            let settlementDevelopers = [economyBoosterChain, healerChain];
            settlementDevelopers = settlementDevelopers.filter((item) => item.length > 0);

            let reinforcementProducer: Array<string> = this.getReinforcementProducer(economyComposition);
            reinforcementProducer = reinforcementProducer.filter((item) => item.length > 0);
            this.Debug(`Reinforcements producer: ${reinforcementProducer.join(", ")}`);

            if (settlementDevelopers.length > 0 && reinforcementProducer.length > 0) {
                let pick = MaraUtils.Random(this.settlementController.MasterMind, 100);

                if (pick < this.settlementController.Settings.ControllerStates.DevelopmentToReinforcementRatio) {
                    selectedCfgIds = MaraUtils.RandomSelect(this.settlementController.MasterMind, settlementDevelopers)!;
                }
                else {
                    selectedCfgIds = reinforcementProducer;
                }
            }
            else {
                let cfgIds = [...settlementDevelopers, reinforcementProducer];
                cfgIds = cfgIds.filter((item) => item.length > 0);
                
                selectedCfgIds = MaraUtils.RandomSelect(this.settlementController.MasterMind, cfgIds);
            }
        }

        if (selectedCfgIds) {
            return new DevelopSettlementTask(selectedCfgIds, this.settlementController, this);
        }
        else {
            return null;
        }
    }

    private getShortestUnavailableChain(economyComposition: UnitComposition, produceableCfgIds: Array<string>): Array<string> | null {
        let globalStrategy = this.settlementController.StrategyController.GlobalStrategy;
        let allRequiredCfgIdItems = [...globalStrategy.DefensiveBuildingsCfgIds, ...globalStrategy.OffensiveCfgIds];
        
        let unavailableCfgIdItems = allRequiredCfgIdItems.filter(
            (value) => {
                return produceableCfgIds.findIndex((item) => item == value.CfgId) < 0
            }
        )

        let produceableUnavailableChains: Array<Array<string>> = [];
        
        for (let item of unavailableCfgIdItems) {
            let unavailableChain: Array<string> = [];
            let atLeastOneItemProduceable = false;
            
            for (let cfgId of item.ProductionChain) {
                if (!economyComposition.has(cfgId)) {
                    unavailableChain.push(cfgId);

                    let index = produceableCfgIds.findIndex((v) => v == cfgId);

                    if (index >= 0) {
                        atLeastOneItemProduceable = true;
                    }
                }
            }

            if (atLeastOneItemProduceable) {
                produceableUnavailableChains.push(unavailableChain);
            }
        }

        produceableUnavailableChains.sort((a, b) => a.length - b.length);
        produceableUnavailableChains = produceableUnavailableChains.splice(0, 2);

        let shortestUnavailableChain: Array<string> | null = MaraUtils.RandomSelect(
            this.settlementController.MasterMind, 
            produceableUnavailableChains
        );

        return shortestUnavailableChain;
    }

    private getEconomyBoosterAndChain(economyComposition: UnitComposition) {
        let developmentBoosterCount = 0;

        economyComposition.forEach((value, key) => {
            if (MaraUtils.IsEconomyBoosterConfigId(key)) {
                developmentBoosterCount += value;
            }
        });

        let censusModel = MaraUtils.GetSettlementCensusModel(this.settlementController.Settlement);
        let peopleLevels = censusModel.PeopleIncomeLevels;
        let maxDevelopmentBoosters = peopleLevels.Item.get(peopleLevels.Count - 1)!.GrowthBuildings;

        if (developmentBoosterCount < maxDevelopmentBoosters) {
            let possibleEconomyBoosters = MaraUtils.GetAllEconomyBoosterConfigIds(this.settlementController.Settlement);
            let economyBooster = MaraUtils.RandomSelect(this.settlementController.MasterMind, possibleEconomyBoosters);

            if (economyBooster) {
                return this.addTechChain(economyBooster, economyComposition);
            }
        }

        return [];
    }

    private getHealerAndChain(economyComposition: UnitComposition): Array<string> {
        let atLeastOneHealerPresent = false;
        
        economyComposition.forEach((value, key) => {
            if (MaraUtils.IsHealerConfigId(key) && MaraUtils.IsBuildingConfigId(key)) {
                atLeastOneHealerPresent = true;
            }
        });

        if (atLeastOneHealerPresent) {
            return [];
        }

        let possbleHealers = MaraUtils.GetAllHealerConfigIds(this.settlementController.Settlement);

        if (possbleHealers.length > 0) {
            let cfgId = MaraUtils.RandomSelect(this.settlementController.MasterMind, possbleHealers)!
            
            return this.addTechChain(cfgId, economyComposition);
        }
        else {
            return [];
        }
    }

    private getReinforcementProducer(economyComposition: UnitComposition): Array<string> {
        let reinforcementProducers: Array<string> = [];
        
        let globalStrategy = this.settlementController.StrategyController.GlobalStrategy;
        let combatCfgIds = [...globalStrategy.OffensiveCfgIds, ...globalStrategy.DefensiveBuildingsCfgIds];

        let minProducerCount = Infinity;
        let slowestProduceCfgId: string | null = null;
        
        for (let selectionItem of combatCfgIds) {
            let producingCfgIds = this.settlementController.ProductionController.GetProducingCfgIds(selectionItem.CfgId);

            if (producingCfgIds.length > 0) {
                let totalProducerCount = 0;

                for (let cfgId of producingCfgIds) {
                    if (economyComposition.has(cfgId)) {
                        totalProducerCount += economyComposition.get(cfgId)!;
                    }
                }

                if (totalProducerCount < minProducerCount) {
                    minProducerCount = totalProducerCount;
                    slowestProduceCfgId = selectionItem.CfgId;
                }
            }
        }

        if (slowestProduceCfgId && minProducerCount < this.settlementController.Settings.ControllerStates.MaxSameCfgIdProducerCount) {
            let producingCfgIds = this.settlementController.ProductionController.GetProducingCfgIds(slowestProduceCfgId);
            let producerCfgId = MaraUtils.RandomSelect(this.settlementController.MasterMind, producingCfgIds);

            if (producerCfgId) {
                reinforcementProducers.push(producerCfgId);
            }
        }

        return reinforcementProducers;
    }

    private addTechChain(cfgId: string, economyComposition: UnitComposition): Array<string> {
        let result = [cfgId];
        
        let chain = MaraUtils.GetCfgIdProductionChain(cfgId, this.settlementController.Settlement);
        let chainCfgIds = chain.map((value) => value.Uid);

        for (let chainCfgId of chainCfgIds) {
            if (!economyComposition.has(chainCfgId)) {
                result.push(chainCfgId);
            }
        }

        return result;
    }

    private makeDefenceBuildTask(): SettlementSubcontrollerTask | null {
        let isAtLeastOneDefenceCfgIdProduceable = false;
        let allProduceableCfgIds = this.settlementController.ProductionController.GetProduceableCfgIds();
        let strategyController = this.settlementController.StrategyController;

        for (let cfgIdItem of strategyController.GlobalStrategy.DefensiveBuildingsCfgIds) {
            let cfgId = allProduceableCfgIds.find((v) => v == cfgIdItem.CfgId);

            if (cfgId) {
                isAtLeastOneDefenceCfgIdProduceable = true;
                break;
            }
        }

        if (isAtLeastOneDefenceCfgIdProduceable) {
            let defenceBuildCandidates: Array<MaraPoint> = [];

            for (let point of this.settlementController.Expands) {
                let guardStrength = strategyController.GetPointGuardStrength(point);

                if (guardStrength < this.settlementController.Settings.Combat.PointDefenseBatchStrength) {
                    defenceBuildCandidates.push(point);
                }
            }

            let settlementLocation = this.settlementController.GetSettlementLocation();

            if (settlementLocation) {
                let guardStrength = strategyController.GetPointGuardStrength(settlementLocation.Center);

                if (guardStrength < 10 * this.settlementController.Settings.Combat.PointDefenseBatchStrength) {
                    defenceBuildCandidates.push(settlementLocation.Center);
                }
            }


            if (defenceBuildCandidates.length == 0) {
                let defenceableGates = strategyController.GetDefenceableGates();

                for (let gate of defenceableGates) {
                    let guardStrength = strategyController.GetPointGuardStrength(
                        gate,
                        this.settlementController.Settings.UnitSearch.ExpandEnemySearchRadius / 2
                    );

                    if (guardStrength < this.settlementController.Settings.Combat.PointDefenseBatchStrength) {
                        defenceBuildCandidates.push(gate);
                    }
                }
            }

            if (defenceBuildCandidates.length > 0) {
                let point = MaraUtils.RandomSelect(this.settlementController.MasterMind, defenceBuildCandidates)!;
                return new DefenceBuildTask(point, this.settlementController, this);
            }
        }

        return null;
    }
}