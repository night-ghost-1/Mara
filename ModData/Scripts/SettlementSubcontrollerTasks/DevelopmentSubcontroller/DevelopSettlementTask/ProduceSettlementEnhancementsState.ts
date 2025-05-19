import { MaraProductionRequest } from "../../../Common/MaraProductionRequest";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { ProductionTaskState } from "../../ProductionTaskState";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";

export class ProduceSettlementEnhancementsState extends ProductionTaskState {
    private cfgIds: Array<string>;
    
    constructor(task: SettlementSubcontrollerTask, settlementController: MaraSettlementController, enhancementsCfgIds: Array<string>) {
        super(task, settlementController);
        this.cfgIds = enhancementsCfgIds;
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
        this.task.Complete(false);
    }

    protected getProductionRequests(): Array<MaraProductionRequest> {
        let result: Array<MaraProductionRequest> = [];

        for (let cfgId of this.cfgIds) {
            result.push(this.makeProductionRequest(cfgId, null, null));
        }

        return result;
    }

    protected getProductionTimeout(): number | null {
        return this.settlementController.Settings.Timeouts.Develop;
    }
}