import { MaraLogger } from "../../../Common/MaraLogger";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { MainBaseDefendingState } from "./MainBaseDefendingState";

export class MainBaseDefendTask extends SettlementSubcontrollerTask {
    public get ExpectedTimeout(): number {
        return Infinity;
    }
    
    constructor(
        settlementController: MaraSettlementController,
        logger: MaraLogger
    ) {
        super(settlementController.Settings.Priorities.SettlementDefence, settlementController, logger);
        
        let state = new MainBaseDefendingState(this, this.SettlementController);
        this.SetState(state);
    }
}