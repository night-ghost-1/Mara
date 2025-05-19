import { MaraLogger } from "../../../Common/MaraLogger";
import { MaraPoint } from "../../../Common/MaraPoint";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { DefenceBuildState } from "./DefenceBuildState";

export class DefenceBuildTask extends SettlementSubcontrollerTask {
    public get ExpectedTimeout(): number {
        return (
            this.SettlementController.Settings.Timeouts.MaxBuildUpProduction +
            this.SettlementController.Settings.Timeouts.Exterminate
        );
    }
    
    constructor(
        point: MaraPoint,
        settlementController: MaraSettlementController,
        logger: MaraLogger
    ) {
        super(settlementController.Settings.Priorities.DefenceBuild, settlementController, logger);
        
        let state = new DefenceBuildState(point, this, this.SettlementController);
        this.SetState(state);
    }
}