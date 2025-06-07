import { MaraProductionRequest } from "../../../Common/MaraProductionRequest";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { MaraUtils } from "../../../MaraUtils";
import { ProductionTaskState } from "../../ProductionTaskState";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { MaraPoint } from "../../../Common/MaraPoint";

export class DefenceBuildState extends ProductionTaskState {
    private point: MaraPoint;
    
    constructor(
        point: MaraPoint,
        task: SettlementSubcontrollerTask, 
        settlementController: MaraSettlementController,
    ) {
        super(task, settlementController);
        this.point = point;
    }

    protected onEntry(): boolean {
        this.task.Debug(`Proceeding to build defence at ${this.point.ToString()}`);
        return true;
    }

    protected onExit(): void {
        //do nothing
    }

    protected onTargetCompositionReached(): void {
        this.task.Complete(true);
    }

    protected onProductionTimeout(): void {
        this.task.Complete(false);
    }

    protected getProductionRequests(): Array<MaraProductionRequest> {
        let armyToProduce = this.settlementController.StrategyController.GetPointGuardArmyComposition();

        let result = new Array<MaraProductionRequest>();

        armyToProduce.forEach(
            (value, key) => {
                for (let i = 0; i < value; i++) {
                    result.push(this.makeProductionRequest(key, this.point, null, false, this.settlementController.Settings.Priorities.SettlementDevelopment));
                }
            }
        );
        
        return result;
    }

    protected getProductionTimeout(): number | null {
        return MaraUtils.Random(
            this.settlementController.MasterMind,
            this.settlementController.Settings.Timeouts.MaxBuildUpProduction,
            this.settlementController.Settings.Timeouts.MinBuildUpProduction
        );
    }
}