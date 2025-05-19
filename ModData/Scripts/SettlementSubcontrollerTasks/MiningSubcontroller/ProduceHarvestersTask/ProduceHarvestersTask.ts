import { MaraLogger } from "../../../Common/MaraLogger";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { ProduceHarvestersState } from "./ProduceHarvestersState";

export class ProduceHarvestersTask extends SettlementSubcontrollerTask {
    public get ExpectedTimeout(): number {
        return (
            this.SettlementController.Settings.Timeouts.ExpandBuild
        );
    }
    
    constructor(
        priority: number, 
        harvesterCount: number,
        harvesterCfgId: string,
        settlementController: MaraSettlementController, 
        logger: MaraLogger
    ) {
        super(priority, settlementController, logger);
        
        let state = new ProduceHarvestersState(harvesterCount, harvesterCfgId, this, this.SettlementController);
        this.SetState(state);
    }
}