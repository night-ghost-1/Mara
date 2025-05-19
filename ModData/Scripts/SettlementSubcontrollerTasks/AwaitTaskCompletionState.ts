
import { SubcontrollerTaskState } from "./SubcontrollerTaskState";
import { SettlementSubcontrollerTask } from "./SettlementSubcontrollerTask";
import { MaraSettlementController } from "../MaraSettlementController";

export class AwaitTaskCompletionState extends SubcontrollerTaskState {
    protected timeout: number;
    
    private awaitedTask: SettlementSubcontrollerTask;
    private nextState: SubcontrollerTaskState;
    private timeoutTick: number | null = null;
    private continueOnTaskFail: boolean;

    constructor(
        awaitedTask: SettlementSubcontrollerTask,
        nextState: SubcontrollerTaskState,
        mainTask: SettlementSubcontrollerTask, 
        settlementController: MaraSettlementController,
        continueOnTaskFail: boolean = true
    ) {
        super(mainTask, settlementController);

        this.awaitedTask = awaitedTask;
        this.nextState = nextState;
        this.timeout = mainTask.ExpectedTimeout;
        this.continueOnTaskFail = continueOnTaskFail;
    }
    
    OnEntry(): void {
        // do nothing
    }

    OnExit(): void {
        if (!this.awaitedTask.IsCompleted) {
            this.awaitedTask.Complete(false);
        }
    }

    Tick(tickNumber: number): void {
        if (this.timeout != null) {
            if (this.timeoutTick == null) {
                this.task.Debug(`Set task await timeout to ${this.timeout} ticks`);
                this.timeoutTick = tickNumber + this.timeout;
            }
            else if (tickNumber > this.timeoutTick) {
                this.task.Debug(`Task await timeout, discontinuing`);
                
                if (this.continueOnTaskFail) {
                    this.task.SetState(this.nextState);
                }
                else {
                    this.task.Complete(false);
                }
                
                return;
            }
        }

        if (this.awaitedTask.IsCompleted) {
            if (this.awaitedTask.IsSuccess || this.continueOnTaskFail) {
                this.task.SetState(this.nextState);
            }
            else {
                this.task.Complete(false);
            }
        }
    }
}