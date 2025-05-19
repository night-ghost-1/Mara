import { Settlement, Unit, UnitMapLayer } from "library/game-logic/horde-types";
import { MaraPoint } from "../MaraPoint";
import { MaraRect } from "../MaraRect";
import { MaraSettlementUnitsCache } from "./MaraSettlementUnitsCache";
import { MaraUnitBushItem } from "./MaraUnitBushItem";

export class MaraUnitCacheItem {
    Parent: MaraSettlementUnitsCache | null;
    
    Unit: Unit
    UnitId: number;
    UnitCfgId: string;
    UnitOwner: Settlement;
    UnitMapLayer: UnitMapLayer;
    UnitHealth: number;
    UnitIsAlive: boolean;
    UnitIsDummy: boolean;

    UnitRect: MaraRect;

    private unitBushItem: MaraUnitBushItem;

    public get UnitBushItem(): MaraUnitBushItem {
        return this.unitBushItem!;
    }

    public set UnitBushItem(value: MaraUnitBushItem) {
        this.unitBushItem = value;
        
        this.UnitRect = new MaraRect(
            new MaraPoint(this.unitBushItem.minX, this.unitBushItem.minY),
            new MaraPoint(this.unitBushItem.maxX, this.unitBushItem.maxY)
        );
    }
    
    public get UnitCell(): MaraPoint {
        return this.UnitRect!.TopLeft;
    }

    constructor(unit: Unit, parent: MaraSettlementUnitsCache) {
        this.Parent = parent;
        
        this.Unit = unit;
        this.UnitId = unit.Id;
        this.UnitCfgId = unit.Cfg.Uid;
        this.UnitOwner = unit.Owner;
        this.UnitMapLayer = unit.MapLayer;
        this.UnitHealth = unit.Health;
        this.UnitIsAlive = unit.IsAlive;
        this.UnitIsDummy = unit.IsDummy;

        this.UnitRect = new MaraRect(new MaraPoint(0, 0), new MaraPoint(0, 0));
        this.unitBushItem = new MaraUnitBushItem(this);
    }
}