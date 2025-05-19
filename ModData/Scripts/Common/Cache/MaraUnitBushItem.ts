import { MaraUnitCacheItem } from "./MaraUnitCacheItem";

export class MaraUnitBushItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;

    UnitCacheItem: MaraUnitCacheItem;

    constructor(unitCacheItem: MaraUnitCacheItem) {
        let cell = unitCacheItem.Unit.Cell;
        let rect = unitCacheItem.Unit.Rect;

        this.minX = cell.X;
        this.minY = cell.Y;
        this.maxX = this.minX + rect.Width - 1;
        this.maxY = this.minY + rect.Height - 1;

        this.UnitCacheItem = unitCacheItem;
    }

    static IsEqual(a: MaraUnitBushItem, b: MaraUnitBushItem): boolean {
        return a.UnitCacheItem.UnitId == b.UnitCacheItem.UnitId;
    }
}
