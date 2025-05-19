import { FiniteStateMachine } from "../Common/FiniteStateMachine/FiniteStateMachine";
import { MaraLogger } from "../Common/MaraLogger";
import { MaraPriority } from "../Common/MaraPriority";
import { MaraSettlementController } from "../MaraSettlementController";

export abstract class SettlementSubcontrollerTask extends FiniteStateMachine {
    IsCompleted: boolean = false;
    IsSuccess: boolean = false;
    Priority: MaraPriority;
    readonly SettlementController: MaraSettlementController;

    public abstract get ExpectedTimeout(): number;

    constructor(priority: MaraPriority, settlementController: MaraSettlementController, logger: MaraLogger) {
        super(logger);
        this.Priority = priority;
        this.SettlementController = settlementController;
    }

    Complete(isSuccess: boolean): void {
        this.ClearState();
        this.IsSuccess = isSuccess;
        this.IsCompleted = true;
    }

    protected onTick(tickNumber: number) {
        // do nothing
    }
}