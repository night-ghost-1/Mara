import { MaraUnitCacheItem } from "./Cache/MaraUnitCacheItem";
import { MaraPriority } from "./MaraPriority";
import { MaraProductionRequestItem } from "./MaraProductionRequestItem";

export class MaraProductionRequest {
    private static idSequence = 0;
    
    public IsForce: boolean = false;
    public Executor: MaraUnitCacheItem | null = null;
    public Items: Array<MaraProductionRequestItem>;
    public readonly Id: number;
    public readonly Priority: MaraPriority;
    public readonly IsMandatory: boolean;

    private isCancelled = false;

    public get IsExecuting(): boolean {
        return this.Items.find((i) => i.IsExecuting) != undefined;
    }

    public get IsCompleted(): boolean {
        return this.Items.every((i) => i.IsCompleted);
    }

    public get IsCancelled(): boolean {
        return this.isCancelled;
    }
    
    constructor(
        items: Array<MaraProductionRequestItem>,
        priority: MaraPriority,
        isForce: boolean = false,
        isMandatory: boolean = true
    ) {
        this.Items = items;
        this.Items.forEach((i) => i.ParentRequest = this);
        this.Priority = priority;
        this.IsForce = isForce;
        this.IsMandatory = isMandatory;

        MaraProductionRequest.idSequence ++;
        this.Id = MaraProductionRequest.idSequence;
    }

    public ToString(): string {
        return `(${this.Priority}) ` + this.Items.map((i) => i.ToString()).join("\n");
    }

    public Cancel(): void {
        this.isCancelled = true;
    }
}