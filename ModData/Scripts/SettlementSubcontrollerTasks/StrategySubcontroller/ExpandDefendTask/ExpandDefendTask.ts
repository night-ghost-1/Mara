import { MaraLogger } from "../../../Common/MaraLogger";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { ExpandDefendState } from "./ExpandDefendState";

export class ExpandDefendTask extends SettlementSubcontrollerTask {
    public get ExpectedTimeout(): number {
        return Infinity;
    }
    
    constructor(
        settlementController: MaraSettlementController,
        logger: MaraLogger
    ) {
        super(settlementController.Settings.Priorities.ExpandDefence, settlementController, logger);
        
        let state = new ExpandDefendState(this, this.SettlementController);
        this.SetState(state);
    }
}