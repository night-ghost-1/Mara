import { Settlement } from "library/game-logic/horde-types";
import { MaraUnitCacheItem } from "../../../Common/Cache/MaraUnitCacheItem";
import { MaraProductionRequest } from "../../../Common/MaraProductionRequest";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { ConstantProductionState } from "../../ConstantProductionState";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";

export class ExterminatingState extends ConstantProductionState {
    private currentTarget: MaraUnitCacheItem | null = null;
    private reinforcementsCfgIds: Array<string> = [];
    private timeoutTick: number | null = null;
    private enemy: Settlement;

    constructor(enemySettlement: Settlement, task: SettlementSubcontrollerTask, settlementController: MaraSettlementController) {
        super(task, settlementController);
        this.enemy = enemySettlement;
    }
    
    OnEntry(): void {
        this.reinforcementsCfgIds = this.settlementController.StrategyController.GetReinforcementCfgIds();
        this.timeoutTick = null;
        this.selectTarget(this.enemy);
    }

    OnExit(): void {
        this.settlementController.TacticalController.Idle();
        this.finalizeProductionRequests();
    }

    Tick(tickNumber: number): void {
        if (this.timeoutTick == null) {
            this.timeoutTick = tickNumber + this.settlementController.Settings.Timeouts.Exterminate;
        }
        else if (tickNumber > this.timeoutTick) {
            this.task.Debug(`Attack is too long-drawn, discontinuing`);
            this.task.Complete(true);
            return;
        }
        
        if (tickNumber % 10 != 0) {
            return;
        }

        this.cleanupProductionRequests();
        this.requestProduction();

        let combativityIndex = this.settlementController.TacticalController.OffenseCombativityIndex;

        if (combativityIndex >= this.settlementController.Settings.ControllerStates.ExterminatingLossRatioThreshold) {
            let enemy = this.enemy;
            
            if (!this.isValidTarget(this.currentTarget)) {
                this.selectTarget(enemy);

                if (!this.isValidTarget(this.currentTarget)) {
                    this.task.Complete(true);
                }
            }
        }
        else {
            this.task.Debug(`Current combativity index '${combativityIndex}' is too low. Retreating...`);
            this.settlementController.TacticalController.Retreat();
            this.task.Complete(true);
            return;
        }
    }

    protected makeProductionRequests(): Array<MaraProductionRequest> {
        let result: Array<MaraProductionRequest> = [];
        
        for (let cfgId of this.reinforcementsCfgIds) {
            let request = this.settlementController.ProductionController.RequestSingleCfgIdProduction(cfgId, this.settlementController.Settings.Priorities.ReinforcementUnitsProduction);

            if (request) {
                result.push(request);
            }
        }

        return result;
    }

    private selectTarget(enemy: Settlement): void {
        this.currentTarget = null;
        let target = this.settlementController.StrategyController.GetOffensiveTarget(enemy);

        if (target) {
            this.currentTarget = target;
            this.settlementController.TacticalController.Attack(target);
        }
    }

    private isValidTarget(unit: MaraUnitCacheItem | null): boolean {
        return !(
            !unit || 
            !unit.UnitIsAlive ||
            this.enemy != unit.UnitOwner
        );
    }
}