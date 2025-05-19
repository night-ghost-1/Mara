import { MaraUnitCacheItem } from "./Cache/MaraUnitCacheItem";

export class MaraRepairRequest {
    public Executor: MaraUnitCacheItem;
    public Target: MaraUnitCacheItem;

    constructor(target: MaraUnitCacheItem, executor: MaraUnitCacheItem) {
        this.Target = target;
        this.Executor = executor;
    }

    public ToString(): string {
        return `${this.Target.Unit.ToString()} by ${this.Executor.Unit.ToString()}`;
    }
}