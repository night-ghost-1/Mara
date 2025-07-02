import { MaraSettlementController } from "../MaraSettlementController";
import { SettlementClusterLocation } from "../Common/Settlement/SettlementClusterLocation";
import { MaraUtils } from "../MaraUtils";
import { MaraSubcontroller } from "./MaraSubcontroller";
import { MaraControllableSquad } from "./Squads/MaraControllableSquad";
import { MaraRect } from "../Common/MaraRect";
import { MaraPoint } from "../Common/MaraPoint";
import { MaraUnitCacheItem } from "../Common/Cache/MaraUnitCacheItem";
import { MaraUnitConfigCache } from "../Common/Cache/MaraUnitConfigCache";
import { Player, Settlement, UnitConfig } from "library/game-logic/horde-types";
import { MaraMap } from "../Common/MapAnalysis/MaraMap";
import { FsmState } from "../Common/FiniteStateMachine/FsmState";
import { TacticalAttackState } from "../SettlementSubcontrollerTasks/TacticalSubcontroller/TacticalAttackState";
import { TacticalDefendState } from "../SettlementSubcontrollerTasks/TacticalSubcontroller/TacticalDefendState";
import { TacticalIdleState } from "../SettlementSubcontrollerTasks/TacticalSubcontroller/TacticalIdleState";
import { MaraSquad } from "./Squads/MaraSquad";

class ConfigComplementarityMap {
    MainPropertyCalculator: (cfgId: string) => boolean;
    ComplementaryPropertiesCalculators: Array<(cfgId: string) => boolean>;

    constructor(
        mainPropertyCalculator: (cfgId: string) => boolean,
        complementaryPropertiesCalculators: Array<(cfgId: string) => boolean>
    ) {
        this.MainPropertyCalculator = mainPropertyCalculator;
        this.ComplementaryPropertiesCalculators = complementaryPropertiesCalculators;
    }
}

export class TacticalSubcontroller extends MaraSubcontroller {
    OffensiveSquads: Array<MaraControllableSquad> = [];
    DefensiveSquads: Array<MaraControllableSquad> = [];
    MilitiaSquads: Array<MaraControllableSquad> = [];
    ReinforcementSquads: Array<MaraControllableSquad> = [];
    
    private initialOffensiveSquadCount: number = 0;
    private unitsInSquads: Map<number, MaraUnitCacheItem> = new Map<number, MaraUnitCacheItem>();

    private configComplementarityTable: Array<ConfigComplementarityMap> = [
        new ConfigComplementarityMap(
            MaraUtils.IsShortSightedConfigId, 
            [
                MaraUtils.IsLongSightedConfigId
            ]
        ),
        new ConfigComplementarityMap(
            (cfgId) => MaraUtils.IsCloseCombatConfigId(cfgId) && !this.isFastConfigId(cfgId), 
            [
                (cfgId) => MaraUtils.IsRangedAccurateConfigId(cfgId) && !this.isFastConfigId(cfgId)
            ]
        ),
        new ConfigComplementarityMap(
            (cfgId) => MaraUtils.IsRangedAccurateConfigId(cfgId) && !this.isFastConfigId(cfgId), 
            [
                (cfgId) => MaraUtils.IsCloseCombatConfigId(cfgId) && !this.isFastConfigId(cfgId)
            ]
        ),
        new ConfigComplementarityMap(
            (cfgId) => MaraUtils.IsCloseCombatConfigId(cfgId) && this.isFastConfigId(cfgId), 
            [
                (cfgId) => MaraUtils.IsRangedAccurateConfigId(cfgId) && this.isFastConfigId(cfgId)
            ]
        ),
        new ConfigComplementarityMap(
            (cfgId) => MaraUtils.IsRangedAccurateConfigId(cfgId) && this.isFastConfigId(cfgId), 
            [
                (cfgId) => MaraUtils.IsCloseCombatConfigId(cfgId) && this.isFastConfigId(cfgId)
            ]
        )
    ];

    // @ts-ignore
    private state: FsmState;
    // @ts-ignore
    private nextState: FsmState | null;

    constructor (parent: MaraSettlementController) {
        super(parent);
        this.Idle();
    }

    public get Player(): Player {
        return this.settlementController.Player;
    }

    public get Settlement(): Settlement {
        return this.settlementController.Settlement;
    }

    public get OffenseCombativityIndex(): number {
        let combativityIndex = 0;

        for (let squad of this.OffensiveSquads) {
            combativityIndex += squad.CombativityIndex;
        }

        return combativityIndex / this.initialOffensiveSquadCount;
    }

    public get EnemySettlements(): Array<Settlement> {
        return this.settlementController.StrategyController.EnemySettlements;
    }

    public get SquadsSettings(): any {
        return this.settlementController.Settings.Squads;
    }

    public get SettlementController(): MaraSettlementController {
        return this.settlementController;
    }

    public get AllSquads(): Array<MaraControllableSquad> {
        return [...this.OffensiveSquads, ...this.DefensiveSquads, ...this.ReinforcementSquads, ...this.MilitiaSquads];
    }
    
    Tick(tickNumber: number): void {
        if (tickNumber % 10 != 0) {
            return;
        }

        for (let squad of this.AllSquads) {
            squad.Tick(tickNumber);
        }

        this.updateSquads();

        if (this.state) {
            this.state.Tick(tickNumber);
        }
        
        if (this.nextState) {
            if (this.state) {
                this.Debug(`Tactical Subcontroller leaving state ${this.state.constructor.name}`);
                this.state.OnExit();
            }
            
            this.state = this.nextState;
            this.nextState = null;
            this.Debug(`Tactical Subcontroller entering state ${this.state.constructor.name}, tick ${tickNumber}`);
            this.state.OnEntry();
        }
    }

    private setState(state: FsmState): void {
        this.nextState = state;
    }

    Attack(target: MaraUnitCacheItem): void {
        let attackState = new TacticalAttackState(target, this, this.state.constructor.name);
        this.setState(attackState);
    }

    Defend(): void {
        let defendState = new TacticalDefendState(this);
        this.setState(defendState);
    }

    Idle(): void {
        let idleState = new TacticalIdleState(this);
        this.setState(idleState);
    }

    Retreat(): void {
        let retreatLocations = this.GetRetreatLocations();
        let healingLocations = retreatLocations.filter((l) => l.HasHealers);

        if (retreatLocations.length > 0) {
            for (let squad of this.OffensiveSquads) {
                this.SendSquadToOneOfLocations(squad, retreatLocations, healingLocations);
            }
        }
    }

    ComposeSquads(attackToDefenseRatio: number): void {
        this.Debug(`Composing squads`);
        
        this.OffensiveSquads = [];
        this.DefensiveSquads = [];
        this.ReinforcementSquads = [];
        this.DismissMilitia();
        this.unitsInSquads = new Map<number, MaraUnitCacheItem>();

        let units = MaraUtils.GetAllSettlementUnits(this.settlementController.Settlement);
        let combatUnits: Array<MaraUnitCacheItem> = [];
        
        for (let unit of units) {
            if (this.isCombatUnit(unit) && unit.UnitIsAlive) {
                if (!this.isBuilding(unit)) {
                    combatUnits.push(unit);
                }
            }
        }

        if (combatUnits.length == 0) {
            return;
        }

        let defensiveStrength = this.settlementController.StrategyController.GetCurrentDefensiveStrength();

        let requiredDefensiveStrength = (1 - attackToDefenseRatio) * (this.calcTotalUnitsStrength(combatUnits) + defensiveStrength);
        let unitIndex = 0;
        let defensiveUnits: Array<MaraUnitCacheItem> = [];
        
        for (unitIndex = 0; unitIndex < combatUnits.length; unitIndex ++) {
            if (defensiveStrength >= requiredDefensiveStrength) {
                //unitIndex here will be equal to an index of the last defensive unit plus one
                break;
            }
            
            let unit = combatUnits[unitIndex];

            if (!this.isBuilding(unit)) {
                defensiveUnits.push(unit);
            }

            defensiveStrength += MaraUtils.GetUnitStrength(unit);
        }

        this.DefensiveSquads = this.createSquadsFromUnits(defensiveUnits);
        this.Debug(`${this.DefensiveSquads.length} defensive squads composed`);
        
        combatUnits.splice(0, unitIndex);
        combatUnits = combatUnits.filter((value, index, array) => {return !this.isBuilding(value)});
        this.OffensiveSquads = this.createSquadsFromUnits(combatUnits);
        this.initialOffensiveSquadCount = this.OffensiveSquads.length;

        this.Debug(`${this.initialOffensiveSquadCount} offensive squads composed`);
    }

    DismissMilitia(): void {
        for (let squad of this.MilitiaSquads) {
            for (let unit of squad.Units) {
                this.settlementController.ReservedUnitsData.FreeUnit(unit);
            }
        }
        this.MilitiaSquads = [];
    }

    DebugSquad(message: string) {
        if (this.settlementController.Settings.Squads.DebugSquads) {
            this.Debug(message);
        }
    }

    NeedRetreat(attackingSquads: Array<MaraSquad>): boolean {
        let defensiveStrength = 0;
        this.DefensiveSquads.forEach((squad) => {defensiveStrength += squad.Strength});

        let enemyStrength = 0;
        attackingSquads.forEach((squad) => {enemyStrength += squad.Strength});

        return defensiveStrength < enemyStrength;
    }

    CanDefend(): boolean {
        if (this.AllSquads.length > 0) {
            return true;
        }

        let offensiveItems = this.settlementController.StrategyController.GlobalStrategy.OffensiveCfgIds;
        let produceableCfgIds = this.settlementController.ProductionController.GetProduceableCfgIds();
        
        for (let item of offensiveItems) {
            if (produceableCfgIds.find((v) => v == item.CfgId)) {
                return true;
            }
        }
        
        return false;
    }

    MakeMilitia(): void {
        let allUnits = MaraUtils.GetAllSettlementUnits(this.settlementController.Settlement);
        let militiaUnits = allUnits.filter((value) => {
            return MaraUtils.IsArmedConfigId(value.UnitCfgId) && 
            !this.isBuilding(value) &&
            !this.settlementController.ReservedUnitsData.IsUnitReserved(value)
        });

        this.MilitiaSquads.push(...this.createSquadsFromUnits(militiaUnits));
        
        for (let unit of militiaUnits) {
            this.settlementController.ReservedUnitsData.ReserveUnit(unit);
        }
    }

    ReinforceSquads(): void {
        this.reinforceSquadsByFreeUnits();

        this.reinforceSquadsByReinforcementSquads();

        let reinforcements = this.ReinforcementSquads.filter((value, index, array) => {return value.CombativityIndex >= 1});
        let units = new Array<MaraUnitCacheItem>();

        for (let squad of reinforcements) {
            units.push(...squad.Units);
        }

        let recombinedReinforcements = this.createSquadsFromUnits(units);
        this.OffensiveSquads.push(...recombinedReinforcements);

        this.ReinforcementSquads = this.ReinforcementSquads.filter((value, index, array) => {return value.CombativityIndex < 1});
    }

    SendSquadToOneOfLocations(
        squad: MaraControllableSquad, 
        allLocations: Array<SettlementClusterLocation>,
        healerLocations: Array<SettlementClusterLocation>
    ): void {
        let squadHealthLevel = squad.GetHealthLevel();
        let locations: Array<SettlementClusterLocation>;

        if (squadHealthLevel <= 0.5) {
            locations = healerLocations.length > 0 ? healerLocations : allLocations;
        }
        else {
            locations = allLocations;
        }
        
        if (locations.length == 0) {
            return;
        }

        this.sendSquadToClosestLocation(squad, locations);
    }

    IssueAttackCommand(attackPath: Array<MaraPoint>): void {
        this.Debug(`Issuing attack command`);

        for (let squad of this.OffensiveSquads) {
            this.SendSquadToAttack(squad, attackPath);
        }
    }

    SendSquadToAttack(squad: MaraControllableSquad, path: Array<MaraPoint>): void {
        if (path.length > 2) {
            // first and last cells are excluded since they usually will be different for all paths
            let pathBody = path.slice(1, path.length - 2);
            let updatedPathBody = MaraMap.UpdatePathForUnit(squad.Units[0], pathBody);

            let updatedPath = [path[0], ...updatedPathBody, path[path.length - 1]];
            squad.Attack(updatedPath);
        }
        else {
            squad.Attack(path);
        }
    }

    GetPullbackLocations(): Array<SettlementClusterLocation> {
        let result: Array<SettlementClusterLocation> = [];
        let settlementLocation = this.settlementController.GetSettlementLocation();

        if (settlementLocation) {
            result.push(settlementLocation);
        }

        for (let expand of this.settlementController.Expands) {
            let radius = Math.max(
                this.settlementController.Settings.ResourceMining.WoodcuttingRadius, 
                this.settlementController.Settings.ResourceMining.MiningRadius
            );
            
            let expandLocation = new SettlementClusterLocation(
                expand, 
                MaraRect.CreateFromPoint(expand, radius)
            );

            result.push(expandLocation);
        }

        let allUnits = MaraUtils.GetAllSettlementUnits(this.settlementController.Settlement);
        let healers = allUnits.filter((u) => MaraUtils.IsHealerConfigId(u.UnitCfgId));

        for (let healer of healers) {
            const HEALING_RADIUS = 3; //TODO: calculate this properly based on a unit config
            
            let healingRect = new MaraRect(
                healer.UnitRect.TopLeft.Shift(new MaraPoint(-HEALING_RADIUS, -HEALING_RADIUS)),
                healer.UnitRect.BottomRight.Shift(new MaraPoint(HEALING_RADIUS, HEALING_RADIUS))
            );
            
            let healerLocation = new SettlementClusterLocation(
                healer.UnitRect.Center,
                healingRect,
                true
            );

            result.push(healerLocation);
        }

        return result;
    }

    GetRetreatLocations(): Array<SettlementClusterLocation> {
        return this.GetPullbackLocations();
    }

    UpdateDefenseTargets(attackingSquads: Array<MaraSquad>): void {
        if (attackingSquads.length == 0) {
            return;
        }
        
        let attackers = this.settlementController.StrategyController.OrderAttackersByDangerLevel(attackingSquads);
        
        let attackerIndex = 0;
        let attackerLocation = attackers[attackerIndex].GetLocation();
        let attackerStrength = attackers[attackerIndex].Strength;
        let accumulatedStrength = 0;
        let defendingSquadGroup: Array<MaraControllableSquad> = [];

        let retreatLocations = this.GetRetreatLocations();

        if (retreatLocations.length == 0) { //everything is lost :(
            return;
        }

        for (let squad of this.AllSquads) {
            let isRetreatedSquad = false;

            for (let location of retreatLocations) {
                if (location.BoundingRect.IsPointInside(squad.GetLocation().Point)) {
                    isRetreatedSquad = true;
                    break;
                }
            }

            if (!isRetreatedSquad) {
                continue;
            }
            else {
                if (
                    !this.DefensiveSquads.find((s) => s == squad) && 
                    !this.MilitiaSquads.find((s) => s == squad)
                ) {
                    this.DefensiveSquads.push(squad);
                    
                    this.OffensiveSquads = this.OffensiveSquads.filter((s) => s != squad);
                    this.ReinforcementSquads = this.ReinforcementSquads.filter((s) => s != squad);
                }
            }
            
            defendingSquadGroup.push(squad);
            accumulatedStrength += squad.Strength;

            if (accumulatedStrength > attackerStrength) {
                // if accumulated strength is less than attacker's, this won't fire and squads of the last batch shall do nothing
                for (let squad of defendingSquadGroup) {
                    squad.Attack([attackerLocation.Point]);
                }
                
                attackerIndex++;

                if (attackerIndex == attackers.length) {
                    return;
                }

                attackerLocation = attackers[attackerIndex].GetLocation();
                attackerStrength = attackers[attackerIndex].Strength;
                accumulatedStrength = 0;
                defendingSquadGroup = [];
            }
        }
    }

    private getWeakestReinforceableSquad(squadMovementType: string, checkReinforcements: boolean): MaraControllableSquad | null {
        let weakestSquad = this.findWeakestReinforceableSquad(this.DefensiveSquads, squadMovementType, (s) => s.IsIdle());

        if (weakestSquad == null) {
            weakestSquad = this.findWeakestReinforceableSquad(this.OffensiveSquads, squadMovementType, (s) => s.IsIdle());
        }

        if (weakestSquad == null && checkReinforcements) {
            weakestSquad = this.findWeakestReinforceableSquad(this.ReinforcementSquads, squadMovementType, (s) => s.IsIdle());
        }

        return weakestSquad;
    }

    private sendSquadToClosestLocation(squad: MaraControllableSquad, locations: Array<SettlementClusterLocation>): void {
        let squadLocation = squad.GetLocation();

        let closestLocation = MaraUtils.FindExtremum(
            locations,
            (next, current) => {
                return (
                    MaraUtils.ChebyshevDistance(squadLocation.Point, current.Center) -
                    MaraUtils.ChebyshevDistance(squadLocation.Point, next.Center)
                );
            }
        );

        if (!squad.CurrentMovementPoint || !squad.CurrentMovementPoint.EqualsTo(closestLocation!.Center)) {
            if (!closestLocation!.BoundingRect.IsPointInside(squadLocation.Point)) {
                let spread = squad.MinSpread * 3;
                let minDimension = Math.min(closestLocation!.BoundingRect.Width, closestLocation!.BoundingRect.Heigth);
                let precision = Math.max(minDimension - spread, 0);
                
                let movementPoint = new MaraPoint(closestLocation!.Center.X, closestLocation!.Center.Y);
                squad.Move([movementPoint], precision / 2);
            }
        }
    }

    private findWeakestReinforceableSquad(
        squads: Array<MaraControllableSquad>, 
        squadMovementType: string,
        squadFilter?: (squad: MaraControllableSquad) => boolean
    ): MaraControllableSquad | null {
        let weakestSquad: MaraControllableSquad | null = null;

        for (let squad of squads) {
            if (squad.Units.length == 0) {
                continue;
            }

            let movementType = this.getSquadMovementType(squad);

            if (movementType != squadMovementType) {
                continue;
            }
            
            if (squadFilter) {
                if (!squadFilter(squad)) {
                    continue;
                }
            }

            if (squad.CombativityIndex >= 1) {
                continue;
            }
            
            if (weakestSquad == null) {
                weakestSquad = squad;
            }

            if (squad.Strength < weakestSquad.Strength) {
                weakestSquad = squad;
            }
        }

        return weakestSquad;
    }

    private reinforceSquadsByFreeUnits(): void {
        let units = MaraUtils.GetAllSettlementUnits(this.settlementController.Settlement);
        let freeUnits: Array<MaraUnitCacheItem> = [];
        
        for (let unit of units) {
            if (
                !this.unitsInSquads.has(unit.UnitId) &&
                this.isCombatUnit(unit) && 
                !this.isBuilding(unit) && 
                unit.UnitIsAlive
            ) {
                freeUnits.push(unit);
                this.Debug(`Unit ${unit.Unit.ToString()} is marked for reinforcements`);
            }
        }

        if (freeUnits.length == 0) {
            return;
        }

        let clusters = this.clusterizeUnitsByMovementType(freeUnits);

        for (let cluster of clusters) {
            let movementType = this.getUnitMovementType(cluster[0]);
            let weakestSquad = this.getWeakestReinforceableSquad(movementType, true);

            if (weakestSquad != null) {
                weakestSquad.AddUnits(cluster);
                this.DebugSquad(`Reinforced squad ${weakestSquad.ToString()} by units ${cluster.map((value) => value.Unit.ToString()).join("\n")}`);

                for (let unit of cluster) {
                    this.unitsInSquads.set(unit.UnitId, unit);
                }
            }
            else {
                let newSquad = this.createSquad(cluster);
                this.ReinforcementSquads.push(newSquad);
                this.DebugSquad(`Created reinforcement squad ${newSquad.ToString()}`);
            }
        }
    }

    private reinforceSquadsByReinforcementSquads(): void {
        let usedReinforcementSquads: Array<MaraControllableSquad> = [];

        for (let squad of this.ReinforcementSquads) {
            // a hack to fix strange bug when empty reinforcement squad appears for some reason
            // remove this code after a proper fix
            if (squad.Units.length == 0) {
                usedReinforcementSquads.push(squad);
                continue;
            }
            
            let movementType = this.getSquadMovementType(squad);
            let weakestSquad = this.getWeakestReinforceableSquad(movementType, false);

            if (!weakestSquad) {
                continue;
            }

            weakestSquad.AddUnits(squad.Units);
            this.DebugSquad(`Reinforced squad ${weakestSquad.ToString()} by units ${squad.Units.map((value) => value.Unit.ToString()).join("\n")}`);

            usedReinforcementSquads.push(squad);
        }

        this.ReinforcementSquads = this.ReinforcementSquads.filter(
            (value) => {return usedReinforcementSquads.indexOf(value) < 0}
        );
    }

    private calcTotalUnitsStrength(units: Array<MaraUnitCacheItem>): number {
        let totalStrength = 0;
        units.forEach((value, index, array) => {totalStrength += MaraUtils.GetUnitStrength(value)});
        
        return totalStrength;
    }

    private createSquadsFromUnits(units: Array<MaraUnitCacheItem>): Array<MaraControllableSquad> {
        let leftUnits = units;
        let result: Array<MaraControllableSquad> = [];

        while (leftUnits.length > 0) {
            let startingUnit = leftUnits[0];
            let complementaryUnits = new Array<MaraUnitCacheItem>();

            for (let unit of leftUnits) {
                let otherComplementaryUnits = this.findComplementaryUnits(unit, leftUnits);

                if (otherComplementaryUnits.length > complementaryUnits.length) {
                    startingUnit = unit;
                    complementaryUnits = otherComplementaryUnits
                }
            }

            let movementType = this.getUnitMovementType(startingUnit);
            let unitCluster = leftUnits.filter((u) => this.getUnitMovementType(u) == movementType);

            let currentSquadStrength = 0;
            let squadUnits = new Map<number, MaraUnitCacheItem>();

            for (let unit of unitCluster) {
                currentSquadStrength += MaraUtils.GetUnitStrength(unit);
                squadUnits.set(unit.UnitId, unit);

                if (currentSquadStrength >= this.settlementController.Settings.Squads.MinStrength / 2) {
                    break;
                }
            }

            complementaryUnits = complementaryUnits.filter((u) => !squadUnits.has(u.UnitId));

            if (complementaryUnits.length == 0) {
                complementaryUnits = unitCluster.filter((u) => !squadUnits.has(u.UnitId));
            }

            for (let unit of complementaryUnits) {
                currentSquadStrength += MaraUtils.GetUnitStrength(unit);
                squadUnits.set(unit.UnitId, unit);

                if (currentSquadStrength >= this.settlementController.Settings.Squads.MinStrength) {
                    break;
                }
            }

            let squad = this.createSquad(Array.from(squadUnits.values()));
            result.push(squad);

            leftUnits = leftUnits.filter((u) => !this.unitsInSquads.has(u.UnitId));
        }
        
        return result;
    }

    private findComplementaryUnits(unit: MaraUnitCacheItem, units: Array<MaraUnitCacheItem>): Array<MaraUnitCacheItem> {
        let complementarityMap = this.configComplementarityTable.find(
            (i) => i.MainPropertyCalculator(unit.UnitCfgId) == true
        );

        if (!complementarityMap) {
            return [];
        }
        else {
            return units.filter(
                (u) => complementarityMap.ComplementaryPropertiesCalculators.some(
                    (f) => f(u.UnitCfgId) == true
                )
            );
        }
    }

    private getUnitMovementType(unit: MaraUnitCacheItem): string {
        return MaraUnitConfigCache.GetConfigProperty(
            unit.UnitCfgId, 
            (cfg) => TacticalSubcontroller.calcConfigMovementClass(cfg, this.settlementController.Settings.Combat.UnitSpeedClusterizationThresholds), 
            "MovementClass"
        ) as string;
    }

    private static calcConfigMovementClass(unitConfig: UnitConfig, speedsThresholds: Array<number>): string {
        let unitCfgId = unitConfig.Uid;
        
        let unitSpeed = MaraUtils.GetConfigIdGrassSpeed(unitCfgId);
        let speedGroupCode: number | null = null;

        for (let i = 0; i < speedsThresholds.length; i++) {
            if (unitSpeed <= speedsThresholds[i]) {
                speedGroupCode = i;
                break;
            }
        }

        if (speedGroupCode == null) {
            speedGroupCode = speedsThresholds.length;
        }

        let moveType = MaraUtils.GetConfigIdMoveType(unitCfgId);
        
        return `${moveType}:${speedGroupCode}`;
    }

    private getSquadMovementType(squad: MaraSquad): string {
        let leastMobileUnit = MaraUtils.FindExtremum(
            squad.Units,
            (c, e) => {
                let candidateMoveType = MaraUtils.GetConfigIdMoveType(c.UnitCfgId);
                let extremumMoveType = MaraUtils.GetConfigIdMoveType(e.UnitCfgId);

                return MaraUtils.CountRaisedBits(extremumMoveType) - MaraUtils.CountRaisedBits(candidateMoveType);
            }
        )!;

        return this.getUnitMovementType(leastMobileUnit);
    }

    private clusterizeUnitsByMovementType(units: Array<MaraUnitCacheItem>): Array<Array<MaraUnitCacheItem>> {
        let clusters = new Map<string, Array<MaraUnitCacheItem>>();

        for (let unit of units) {
            let clusterKey = this.getUnitMovementType(unit);
            let cluster: Array<MaraUnitCacheItem>;
            
            if (clusters.has(clusterKey)) {
                cluster = clusters.get(clusterKey)!;
            }
            else {
                cluster = new Array<MaraUnitCacheItem>();
            }

            cluster.push(unit);
            clusters.set(clusterKey, cluster);
        }
        
        return Array.from(clusters.values());
    }

    private isFastConfigId(cfgId: string): boolean {
        let speed = MaraUtils.GetConfigIdGrassSpeed(cfgId);
        let speedThresholds = this.settlementController.Settings.Combat.UnitSpeedClusterizationThresholds;

        return speed >= speedThresholds[speedThresholds.length - 1];
    }

    private createSquad(units: Array<MaraUnitCacheItem>): MaraControllableSquad {
        let squad = new MaraControllableSquad(units, this);
        
        for (let unit of units) {
            this.unitsInSquads.set(unit.UnitId, unit);
        }

        return squad;
    }

    private updateSquads(): void {
        this.OffensiveSquads = this.OffensiveSquads.filter((squad) => {return squad.Units.length > 0});
        this.DefensiveSquads = this.DefensiveSquads.filter((squad) => {return squad.Units.length > 0});
        this.ReinforcementSquads = this.ReinforcementSquads.filter((squad) => {return squad.Units.length > 0});
        this.MilitiaSquads = this.MilitiaSquads.filter((squad) => {return squad.Units.length > 0});
        
        if (this.unitsInSquads != null) {
            let filteredUnits = new Map<number, MaraUnitCacheItem>();
            
            this.unitsInSquads.forEach(
                (value, key, map) => {
                    if (value.UnitIsAlive) {
                        filteredUnits.set(key, value)
                    }
                }
            );

            this.unitsInSquads = filteredUnits;
        }
    }

    private isCombatUnit(unit: MaraUnitCacheItem): boolean {
        return MaraUtils.IsCombatConfigId(unit.UnitCfgId);
    }

    private isBuilding(unit: MaraUnitCacheItem): boolean {
        return MaraUtils.IsBuildingConfigId(unit.UnitCfgId);
    }
}