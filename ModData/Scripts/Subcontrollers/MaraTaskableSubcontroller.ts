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
                this.Debug(`Task ${this.activeTask.ToString()} completed with result ${this.activeTask.IsSuccess}`);

                if (this.activeTask.IsSuccess) {
                    this.onTaskSuccess(tickNumber);
                }
                else {
                    this.onTaskFailure(tickNumber);
                }

                this.activeTask = null;
            }
            else if (this.activeTask.IsIdle) {
                this.Debug(`Task ${this.activeTask.ToString()} put on idle`);
                
                this.allTasks.push(this.activeTask);
                this.activeTask = null;
            }
            else {
                let priorityTask = this.selectMaxPriorityTask();

                if (priorityTask && priorityTask.Priority > this.activeTask.Priority) {
                    this.setActiveTask(priorityTask);
                }
            }
        }
        else if (this.allTasks.length > 0) {
            let highestPriorityTask = this.selectMaxPriorityTask();
            
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

        for (let task of this.allTasks) {
            if (task.IsIdle) {
                task.Tick(tickNumber);
            }
        }
    }

    AddTask(task: SettlementSubcontrollerTask): void {
        this.allTasks.push(task);
        this.Debug(`Added task ${task.ToString()} with priority ${task.Priority} to queue`);
    }

    private setActiveTask(task: SettlementSubcontrollerTask): void {
        if (this.activeTask) {
            this.activeTask.Complete(false);
            this.Debug(`Task ${this.activeTask.ToString()} cancelled`);
        }

        this.activeTask = task;
        this.allTasks = this.allTasks.filter((t) => t != this.activeTask);
        this.Debug(`Start executing task ${this.activeTask.ToString()}`);
    }

    private selectMaxPriorityTask(): SettlementSubcontrollerTask | null {
        let tasks = this.allTasks.filter((t) => !t.IsIdle);
        
        return MaraUtils.FindExtremum(tasks, (c, e) => c.Priority - e.Priority);
    }
}