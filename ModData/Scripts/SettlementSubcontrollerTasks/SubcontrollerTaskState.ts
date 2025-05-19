import { MaraSettlementController } from "../MaraSettlementController";
import { FsmState } from "../Common/FiniteStateMachine/FsmState";
import { SettlementSubcontrollerTask } from "./SettlementSubcontrollerTask";

export abstract class SubcontrollerTaskState extends FsmState {
    protected readonly settlementController: MaraSettlementController;
    protected readonly task: SettlementSubcontrollerTask;

    public get ProfilerName(): string {
        return this.constructor.name;
    }
    
    constructor(task: SettlementSubcontrollerTask, settlementController: MaraSettlementController) {
        super();
        this.settlementController = settlementController;
        this.task = task;
    }
}