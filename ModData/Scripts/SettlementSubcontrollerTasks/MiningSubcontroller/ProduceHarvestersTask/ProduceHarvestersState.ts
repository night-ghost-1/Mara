import { MaraProductionRequest } from "../../../Common/MaraProductionRequest";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { ProductionTaskState } from "../../ProductionTaskState";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";

export class ProduceHarvestersState extends ProductionTaskState {
    protected requestMiningOnInsufficientResources = false;

    private harvesterCount: number;
    private harvesterCfgId: string;
    
    constructor(
        harvesterCount: number,
        harvesterCfgId: string,
        task: SettlementSubcontrollerTask, 
        settlementController: MaraSettlementController
    ) {
        super(task, settlementController);
        
        this.harvesterCount = harvesterCount;
        this.harvesterCfgId = harvesterCfgId;
    }

    protected onEntry(): boolean {
        return true;
    }

    protected onExit(): void {
        //do nothing
    }

    protected onTargetCompositionReached(): void {
        this.task.Complete(true);
    }

    protected onProductionTimeout(): void {
        this.task.Complete(true);
    }

    protected getProductionRequests(): Array<MaraProductionRequest> {
        let result: Array<MaraProductionRequest> = [];

        for (let i = 0; i < this.harvesterCount; i ++) {
            let request = this.makeProductionRequest(this.harvesterCfgId, null, null);
            result.push(request);
        }

        return result;
    }

    protected getProductionTimeout(): number | null {
        return this.settlementController.Settings.Timeouts.ExpandBuild;
    }
}