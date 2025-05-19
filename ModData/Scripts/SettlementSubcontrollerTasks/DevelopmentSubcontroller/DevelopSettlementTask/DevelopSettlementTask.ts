import { MaraLogger } from "../../../Common/MaraLogger";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { ProduceSettlementEnhancementsState } from "./ProduceSettlementEnhancementsState";

export class DevelopSettlementTask extends SettlementSubcontrollerTask {
    public get ExpectedTimeout(): number {
        return (
            this.SettlementController.Settings.Timeouts.Develop +
            this.SettlementController.Settings.Timeouts.ExpandBuild
        );
    }
    
    constructor(
        cfgIds: Array<string>,
        settlementController: MaraSettlementController,
        logger: MaraLogger
    ) {
        super(settlementController.Settings.Priorities.SettlementDevelopment, settlementController, logger);
        
        let state = new ProduceSettlementEnhancementsState(this, this.SettlementController, cfgIds);
        this.SetState(state);
    }
}