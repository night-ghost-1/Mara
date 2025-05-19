import { MaraProductionRequest } from "../../../Common/MaraProductionRequest";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { ConstantProductionState } from "../../ConstantProductionState";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";

export class DefendingState extends ConstantProductionState {
    private reinforcementsCfgIds: Array<string> = [];
    
    constructor(task: SettlementSubcontrollerTask, settlementController: MaraSettlementController) {
        super(task, settlementController);
    }
    
    OnEntry(): void {
        this.reinforcementsCfgIds = this.settlementController.StrategyController.GetReinforcementCfgIds();
        this.settlementController.TacticalController.Defend();
    }

    OnExit(): void {
        this.settlementController.TacticalController.Idle();
        this.settlementController.StrategyController.CheckForUnderAttack = true;
        this.finalizeProductionRequests();
    }

    Tick(tickNumber: number): void {
        if (tickNumber % 50 == 0) {
            this.cleanupProductionRequests();

            if (!this.settlementController.StrategyController.IsUnderAttack()) {
                this.task.Debug(`Attack countered`);
                this.task.Complete(true);
                return;
            }
            else {
                this.requestProduction();
            }
        }
    }

    protected makeProductionRequests(): Array<MaraProductionRequest> {
        let result: Array<MaraProductionRequest> = []

        for (let cfgId of this.reinforcementsCfgIds) {
            let chain = this.settlementController.ProductionController.ForceRequestSingleCfgIdProduction(cfgId, this.settlementController.Settings.Priorities.DefenceUnitsProduction);
            result.push(...chain);
        }
        
        return result;
    }
}