import { MaraLogger } from "../../../Common/MaraLogger";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { DefendingState } from "./DefendingState";

export class DefendTask extends SettlementSubcontrollerTask {
    public get ExpectedTimeout(): number {
        return Infinity;
    }
    
    constructor(
        settlementController: MaraSettlementController,
        logger: MaraLogger
    ) {
        super(settlementController.Settings.Priorities.SettlementDefence, settlementController, logger);
        
        let state = new DefendingState(this, this.SettlementController);
        this.SetState(state);
    }
}