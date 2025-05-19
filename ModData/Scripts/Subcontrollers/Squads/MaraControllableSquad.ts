import { MaraUtils } from "../../MaraUtils";
import { TacticalSubcontroller } from "../TacticalSubcontroller";
import { MaraSquad } from "./MaraSquad";
import { MaraSquadIdleState } from "./SquadStates/MaraSquadIdleState";
import { MaraSquadState } from "./SquadStates/MaraSquadState";
import { MaraPoint } from "../../Common/MaraPoint";
import { MaraUnitCacheItem } from "../../Common/Cache/MaraUnitCacheItem";

export class MaraControllableSquad extends MaraSquad {
    static IdSequence: number = 0;
    
    private controller: TacticalSubcontroller;
    private initialStrength: number;
    // @ts-ignore
    private state: MaraSquadState;
    private minSpread: number = Infinity;

    public get MinSpread(): number {
        return this.minSpread;
    }

    public get Controller(): TacticalSubcontroller {
        return this.controller;
    }

    public get CombativityIndex(): number {
        return this.Strength / this.initialStrength;
    }

    public get Id(): number {
        return this.id;
    }

    id: number;

    AttackPath: Array<MaraPoint> | null = null;
    MovementPath: Array<MaraPoint> | null = null;
    CurrentPath: Array<MaraPoint> | null = null;
    CurrentMovementPoint: MaraPoint | null = null;
    MovementPrecision: number = 0;

    constructor(units: Array<MaraUnitCacheItem>, controller: TacticalSubcontroller) {
        super(units);

        MaraControllableSquad.IdSequence ++;
        this.id = MaraControllableSquad.IdSequence;

        this.controller = controller;
        this.initialStrength = Math.max(this.Strength, this.controller.SquadsSettings.MinStrength);
        this.recalcMinSpread();

        let unitNames = this.Units.map((value) => value.Unit.ToString());
        this.Debug(`Squad created. Units:\n${unitNames.join("\n")}`);

        this.SetState(new MaraSquadIdleState(this));
    }

    Tick(tickNumber: number): void {
        if (tickNumber % 10 != 0) {
            return;
        }
        
        this.location = null;
        this.cleanup();
        this.state.Tick(tickNumber);
    }

    Attack(path: Array<MaraPoint>, precision?: number): void {
        this.AttackPath = path;
        this.MovementPath = null;
        this.MovementPrecision = precision ? precision : this.controller.SquadsSettings.DefaultMovementPrecision;
    }

    Move(path: Array<MaraPoint>, precision?: number): void {
        this.MovementPath = path;
        this.AttackPath = null;
        this.MovementPrecision = precision ? precision : this.controller.SquadsSettings.DefaultMovementPrecision;
    }

    SelectNextMovementPoint(): MaraPoint | null {
        this.Debug(`selecting next movement point...`);
        if (!this.CurrentPath) {
            this.Debug(`current path is not defined`);
            return null;
        }
        else {
            this.Debug(`current path is ${this.CurrentPath.map((p) => p.ToString()).join(", ")}`);
        }

        let location = this.GetLocation();

        let startIndex = 0;

        for (let i = 0; i < this.CurrentPath.length; i ++) {
            let distance = MaraUtils.ChebyshevDistance(this.CurrentPath[i], location.Point);

            if (distance <= this.MovementPrecision) {
                startIndex = i + 1;
            }
        }

        this.Debug(`start index = ${startIndex}`);

        let closestPointIndex: number | null = null;
        let closestDistance = Infinity;

        for (let i = startIndex; i < this.CurrentPath.length; i ++) {
            let distance = MaraUtils.ChebyshevDistance(this.CurrentPath[i], location.Point);
            
            if (distance <= closestDistance) {
                closestPointIndex = i;
                closestDistance = distance;
            }
        }

        if (closestPointIndex == null) {
            this.Debug(`closest point not found`);
            return null;
        }

        this.Debug(`closest point index = ${closestPointIndex}`);

        if (closestPointIndex >= this.CurrentPath.length - 1) {
            this.Debug(`next point = ${this.CurrentPath[closestPointIndex].ToString()}`);
            return this.CurrentPath[closestPointIndex];
        }

        let closestPoint = this.CurrentPath[closestPointIndex];
        let nextPoint = this.CurrentPath[closestPointIndex + 1];

        let straigthDistance = MaraUtils.ChebyshevDistance(location.Point, nextPoint);
        let closestPointDistance = 
            MaraUtils.ChebyshevDistance(location.Point, closestPoint) + 
            MaraUtils.ChebyshevDistance(closestPoint, nextPoint);

        if (straigthDistance < closestPointDistance) {
            this.Debug(`next point = ${nextPoint.ToString()}`);
            return nextPoint;
        }
        else {
            this.Debug(`next point = ${closestPoint.ToString()}`);
            return closestPoint;
        }
    }

    SetState(newState: MaraSquadState): void {
        if (this.state) {
            this.state.OnExit();
        }

        this.state = newState;
        this.Debug(`entering state ${this.state.constructor.name}`);

        this.state.OnEntry();
    }

    IsIdle(): boolean {
        return this.state.IsIdle();
    }

    IsEnemyNearby(): boolean {
        let enemies = MaraUtils.GetSettlementUnitsAroundPoint(
            this.GetLocation().Point, 
            this.Controller.SquadsSettings.EnemySearchRadius,
            this.Controller.EnemySettlements
        );

        return enemies.length > 0;
    }

    GetNearbyUnits(): Array<MaraUnitCacheItem> {
        let units = MaraUtils.GetSettlementUnitsAroundPoint(
            this.GetLocation().Point, 
            this.Controller.SquadsSettings.EnemySearchRadius,
            undefined,
            (unit) => true,
            true
        );

        return units;
    }

    CanAttackAtLeastOneUnit(targetUnits: Array<MaraUnitCacheItem>): boolean {
        for (let unit of this.Units) {
            for (let target of targetUnits) {
                if (MaraUtils.CanAttack(unit, target)) {
                    return true;
                }
            }
        }

        return false;
    }

    ToString(): string {
        let result = `${this.id}`;        
        return result;
    }

    public Debug(message: string): void {
        let squadName = this.ToString();
        this.controller.DebugSquad(`[Squad ${squadName}]: ${message}`);
    }

    private recalcMinSpread(): void {
        this.minSpread = Math.round(Math.sqrt(this.Units.length));
    }

    protected cleanup(): void {
        let unitCount = this.Units.length;
        this.cleanupUnitList();
        
        if (this.Units.length != unitCount) {
            this.recalcMinSpread();
        }
    }

    protected onUnitsAdded(): void {
        this.recalcMinSpread();
    }
}