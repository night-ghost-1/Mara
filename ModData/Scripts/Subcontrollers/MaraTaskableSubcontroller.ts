import { MaraUtils } from "../MaraUtils";
import { SettlementSubcontrollerTask } from "../SettlementSubcontrollerTasks/SettlementSubcontrollerTask";
import { MaraSubcontroller } from "./MaraSubcontroller";

export abstract class MaraTaskableSubcontroller extends MaraSubcontroller {
    protected abstract doRoutines(tickNumber: number): void;
    protected abstract makeSelfTask(tickNumber: number): SettlementSubcontrollerTask | null;
    protected abstract onTaskSuccess(tickNumber: number): void;
    protected abstract onTaskFailure(tickNumber: number): void;

    protected nextTaskAttemptTick: number = 0;

    private activeTask: SettlementSubcontrollerTask | null = null;
    private allTasks: Array<SettlementSubcontrollerTask> = [];
    
    Tick(tickNumber: number): void {
        this.doRoutines(tickNumber);

        this.allTasks = this.allTasks.filter((t) => !t.IsCompleted);
        
        if (this.activeTask) {
            if (this.activeTask.IsCompleted) {
                this.Debug(`Task ${this.activeTask.constructor.name} completed with result ${this.activeTask.IsSuccess}`);

                if (this.activeTask.IsSuccess) {
                    this.onTaskSuccess(tickNumber);
                }
                else {
                    this.onTaskFailure(tickNumber);
                }

                this.activeTask = null;
            }
            else {
                let priorityTask = MaraUtils.FindExtremum(this.allTasks, (c, e) => c.Priority - e.Priority);

                if (priorityTask && priorityTask.Priority > this.activeTask.Priority) {
                    this.setActiveTask(priorityTask);
                }
            }
        }
        else if (this.allTasks.length > 0) {
            let highestPriorityTask = MaraUtils.FindExtremum(this.allTasks, (c, e) => c.Priority - e.Priority);
            
            if (highestPriorityTask) {
                this.setActiveTask(highestPriorityTask);
            }
        }
        else {
            if (tickNumber > this.nextTaskAttemptTick) {
                let selfTask = this.makeSelfTask(tickNumber);
                
                if (selfTask) {
                    this.AddTask(selfTask);
                }
            }
        }

        if (this.activeTask) {
            this.activeTask.Tick(tickNumber);
        }
    }

    AddTask(task: SettlementSubcontrollerTask): void {
        this.allTasks.push(task);
        this.Debug(`Added task ${task.constructor.name} with priority ${task.Priority} to queue`);
    }

    private setActiveTask(task: SettlementSubcontrollerTask): void {
        if (this.activeTask) {
            this.activeTask.Complete(false);
            this.Debug(`Task ${this.activeTask.constructor.name} cancelled`);
        }

        this.activeTask = task;
        this.allTasks = this.allTasks.filter((t) => t != this.activeTask);
        this.Debug(`Start executing task ${this.activeTask.constructor.name}`);
    }
}