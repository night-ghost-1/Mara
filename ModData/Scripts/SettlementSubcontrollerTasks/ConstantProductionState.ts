
import { SubcontrollerTaskState } from "./SubcontrollerTaskState";
import { SettlementSubcontrollerTask } from "./SettlementSubcontrollerTask";
import { MaraSettlementController } from "../MaraSettlementController";
import { MaraProductionRequest } from "../Common/MaraProductionRequest";

export abstract class ConstantProductionState extends SubcontrollerTaskState {
    private productionRequests: Array<MaraProductionRequest>;
    
    constructor(
        task: SettlementSubcontrollerTask, 
        settlementController: MaraSettlementController
    ) {
        super(task, settlementController);
        this.productionRequests = [];
    }
    
    protected abstract makeProductionRequests(): Array<MaraProductionRequest>;

    protected requestProduction(): void {
        let requests = this.makeProductionRequests();
        this.productionRequests.push(...requests);
    }

    protected cleanupProductionRequests(): void {
        this.productionRequests = this.productionRequests.filter((r) => !r.IsCompleted && !r.IsCancelled);
    }

    protected finalizeProductionRequests(): void {
        this.cleanupProductionRequests();

        for (let request of this.productionRequests) {
            request.Cancel();
            this.task.Debug(`Cancelled production request ${request.ToString()}`);
        }
    }
}