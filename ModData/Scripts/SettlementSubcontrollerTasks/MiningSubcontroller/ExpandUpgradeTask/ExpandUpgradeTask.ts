import { MaraLogger } from "../../../Common/MaraLogger";
import { MaraPoint } from "../../../Common/MaraPoint";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { ExpandUpgradeState } from "./ExpandUpgradeState";

export class ExpandUpgradeTask extends SettlementSubcontrollerTask {
    public get ExpectedTimeout(): number {
        return (
            this.SettlementController.Settings.Timeouts.ExpandPrepare +
            this.SettlementController.Settings.Timeouts.Exterminate +
            this.SettlementController.Settings.Timeouts.ExpandBuild
        );
    }
    
    constructor(
        priority: number, 
        metalStockCfgId: string,
        metalStockBuildPoint: MaraPoint,
        settlementController: MaraSettlementController, 
        logger: MaraLogger
    ) {
        super(priority, settlementController, logger);
        
        let state = new ExpandUpgradeState(this, metalStockCfgId, metalStockBuildPoint, this.SettlementController);

        this.SetState(state);
    }
}