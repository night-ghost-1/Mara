import { MaraLogger } from "../../../Common/MaraLogger";
import { MaraPoint } from "../../../Common/MaraPoint";
import { MaraPriority } from "../../../Common/MaraPriority";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { LandmarkCapturePrepareState } from "./LandmarkCapturePrepareState";

export class LandmarkCaptureTask extends SettlementSubcontrollerTask {
    public get ExpectedTimeout(): number {
        return (
            this.SettlementController.Settings.Timeouts.MaxBuildUpProduction +
            this.SettlementController.Settings.Timeouts.Exterminate
        );
    }
    
    constructor(
        point: MaraPoint,
        settlementController: MaraSettlementController,
        logger: MaraLogger,
        priority?: MaraPriority
    ) {
        let finalPriority = priority ?? settlementController.Settings.Priorities.LandmarkCapture;
        super(finalPriority, settlementController, logger);
        
        let state = new LandmarkCapturePrepareState(point, this, this.SettlementController);
        this.SetState(state);
    }
}