import { MaraPoint } from "../../../Common/MaraPoint";
import { MaraProductionRequest } from "../../../Common/MaraProductionRequest";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { ProductionTaskState } from "../../ProductionTaskState";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";

export class ExpandUpgradeState extends ProductionTaskState {
    protected requestMiningOnInsufficientResources = false;
    
    private metalStockCfgId: string;
    private metalStockBuildPoint: MaraPoint;

    constructor(
        task: SettlementSubcontrollerTask, 
        metalStockCfgId: string,
        metalStockBuildPoint: MaraPoint,
        settlementController: MaraSettlementController, 
    ) {
        super(task, settlementController);
        this.metalStockCfgId = metalStockCfgId;
        this.metalStockBuildPoint = metalStockBuildPoint;
    }

    protected onEntry(): boolean {
        return true;
    }

    protected onExit(): void {
        // do nothing
    }

    protected onTargetCompositionReached(): void {
        this.task.Complete(true);
    }

    protected onProductionTimeout(): void {
        this.task.Complete(false);
    }

    protected getProductionRequests(): Array<MaraProductionRequest> {
        let result = new Array<MaraProductionRequest>();
        result.push(this.makeProductionRequest(this.metalStockCfgId, this.metalStockBuildPoint, null));

        return result;
    }

    protected getProductionTimeout(): number | null {
        return this.settlementController.Settings.Timeouts.ExpandBuild;
    }
}