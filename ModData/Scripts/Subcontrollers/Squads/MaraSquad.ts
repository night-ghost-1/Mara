import { MaraUtils } from "../../MaraUtils";
import { MaraPoint } from "../../Common/MaraPoint";
import { MaraUnitCacheItem } from "../../Common/Cache/MaraUnitCacheItem";

export class MaraSquadLocation {
    Point: MaraPoint;
    Spread: number;
    SpreadCenter: MaraPoint;

    constructor(point: MaraPoint, spread: number, spreadCenter: MaraPoint) {
        this.Point = point;
        this.Spread = spread;
        this.SpreadCenter = spreadCenter;
    }
}

export class MaraSquad {
    Units: Array<MaraUnitCacheItem>;
    protected location: MaraSquadLocation | null = null;

    public get Strength(): number {
        this.cleanup();
        
        let strength = 0;
        
        for (let unit of this.Units) {
            strength += MaraUtils.GetUnitStrength(unit);
        }
        
        return strength;
    }
    
    constructor(units: Array<MaraUnitCacheItem>) {
        this.Units = units;
    }

    protected cleanup(): void {
        this.cleanupUnitList();
    }

    protected cleanupUnitList(): void {
        this.Units = this.Units.filter((unit) => {return unit.UnitIsAlive && unit.Parent != null && !unit.UnitIsDummy});
    }

    Tick(tickNumber: number): void {
        if (tickNumber % 10 != 0) {
            return;
        }
        
        this.location = null;
        this.cleanup();
    }

    GetLocation(): MaraSquadLocation {
        if (!this.location) {
            this.cleanup();
            
            if (this.Units.length > 0) {
                let uppermostUnit: MaraUnitCacheItem | null = null;
                let lowermostUnit: MaraUnitCacheItem | null = null;
                let leftmostUnit: MaraUnitCacheItem | null = null;
                let rightmostUnit: MaraUnitCacheItem | null = null;

                let avgPosition = {X: 0, Y: 0};
                
                for (let unit of this.Units) {
                    avgPosition.X += unit.UnitCell.X;
                    avgPosition.Y += unit.UnitCell.Y;
                    
                    if (uppermostUnit == null) {
                        uppermostUnit = unit;
                    }

                    if (lowermostUnit == null) {
                        lowermostUnit = unit;
                    }

                    if (leftmostUnit == null) {
                        leftmostUnit = unit;
                    }

                    if (rightmostUnit == null) {
                        rightmostUnit = unit;
                    }

                    if (unit != uppermostUnit && unit.UnitRect.TopLeft.Y < uppermostUnit.UnitRect.TopLeft.Y) {
                        uppermostUnit = unit;
                    }

                    if (unit != lowermostUnit && unit.UnitRect.BottomRight.Y > lowermostUnit.UnitRect.BottomRight.Y) {
                        lowermostUnit = unit;
                    }

                    if (unit != leftmostUnit && unit.UnitRect.TopLeft.X < leftmostUnit.UnitRect.TopLeft.X) {
                        leftmostUnit = unit;
                    }

                    if (unit != rightmostUnit && unit.UnitRect.BottomRight.X > rightmostUnit.UnitRect.BottomRight.X) {
                        rightmostUnit = unit;
                    }
                }

                let verticalSpread = lowermostUnit!.UnitRect.BottomRight.Y - uppermostUnit!.UnitRect.TopLeft.Y;
                let horizontalSpread = rightmostUnit!.UnitRect.BottomRight.X - leftmostUnit!.UnitRect.TopLeft.X;
                let spread = Math.max(verticalSpread, horizontalSpread);

                let spreadCenter = new MaraPoint(
                    leftmostUnit!.UnitRect.TopLeft.X + Math.round(horizontalSpread / 2),
                    uppermostUnit!.UnitRect.TopLeft.Y + Math.round(verticalSpread / 2)
                );

                let point = new MaraPoint(
                    Math.round(avgPosition.X / this.Units.length),
                    Math.round(avgPosition.Y / this.Units.length)
                );

                this.location = new MaraSquadLocation(point, spread, spreadCenter);
            }
            else {
                this.location = new MaraSquadLocation(new MaraPoint(0, 0), 0, new MaraPoint(0, 0));
            }
        }

        return this.location;
    }

    IsAllUnitsIdle(): boolean {
        this.cleanup();

        for (let unit of this.Units) {
            if (!unit.Unit.OrdersMind.IsIdle()) {
                return false;
            }
        }

        return true;
    }

    AddUnits(units: Array<MaraUnitCacheItem>): void {
        this.cleanup();

        this.Units.push(...units);
        this.location = null;

        this.onUnitsAdded();
    }

    GetHealthLevel(): number {
        let totalHealth = 0;
        let maxHealth = 0;

        for (let unit of this.Units) {
            maxHealth += MaraUtils.GetConfigIdMaxHealth(unit.UnitCfgId);
            totalHealth += unit.UnitHealth;
        }

        return totalHealth / maxHealth;
    }

    protected onUnitsAdded(): void {
        //do nothing
    }
}