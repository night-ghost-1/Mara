import { Settlement } from "library/game-logic/horde-types";
import { MaraLogger } from "../../../Common/MaraLogger";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { BuildUpState } from "./BuildUpState";

export class AttackTask extends SettlementSubcontrollerTask {
    public get ExpectedTimeout(): number {
        return (
            this.SettlementController.Settings.Timeouts.MaxBuildUpProduction +
            this.SettlementController.Settings.Timeouts.Exterminate
        );
    }
    
    constructor(
        enemySettlement: Settlement,
        settlementController: MaraSettlementController,
        logger: MaraLogger
    ) {
        super(settlementController.Settings.Priorities.Attack, settlementController, logger);
        
        let state = new BuildUpState(enemySettlement, this, this.SettlementController);
        this.SetState(state);
    }
}