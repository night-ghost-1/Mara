import { MaraUtils } from "../../../MaraUtils";
import { MaraSquad, MaraSquadLocation } from "../MaraSquad";
import { MaraSquadAttackState } from "./MaraSquadAttackState";
import { MaraSquadMoveState } from "./MaraSquadMoveState";
import { MaraSquadState } from "./MaraSquadState";
import { TileType } from "library/game-logic/horde-types";
import { MaraSquadPullbackState } from "./MaraSquadPullbackState";
import { MaraCellDataHolder } from "../../../Common/MaraCellDataHolder";
import { MaraPoint } from "../../../Common/MaraPoint";
import { MaraMap } from "../../../Common/MapAnalysis/MaraMap";
import { MaraUnitCacheItem } from "../../../Common/Cache/MaraUnitCacheItem";
import { MaraUnitConfigCache } from "../../../Common/Cache/MaraUnitConfigCache";
import { IMaraPoint } from "../../../Common/IMaraPoint";

class MaraThreatMap extends MaraCellDataHolder {
    constructor () {
        super();
    }

    Get(cell: IMaraPoint): any {
        let index = this.makeIndex(cell);
        return (this.data[index] ?? 0);
    }

    Set(cell: IMaraPoint, value: any) {
        let index = this.makeIndex(cell);
        this.data[index] = value;
    }

    Add(cell: IMaraPoint, value: any): void {
        let index = this.makeIndex(cell);
        let threat = (this.data[index] ?? 0) + value;
        this.data[index] = threat;
    }
}

class MaraCellHeuristics extends MaraCellDataHolder {
    constructor () {
        super();
    }

    Get(cell: IMaraPoint): any {
        let index = this.makeIndex(cell);
        return this.data[index];
    }

    Set(cell: IMaraPoint, value: any) {
        let index = this.makeIndex(cell);
        this.data[index] = value;
    }
}

class MaraReservedCellData extends MaraCellDataHolder {
    constructor () {
        super();
    }

    Get(cell: IMaraPoint): any {
        let index = this.makeIndex(cell);
        return (this.data[index] ?? false);
    }

    Set(cell: IMaraPoint, value: any) {
        let index = this.makeIndex(cell);
        this.data[index] = value;
    }
}

export class MaraSquadBattleState extends MaraSquadState {
    private enemySquads: Array<MaraSquad> = [];
    private enemyUnits: Array<MaraUnitCacheItem> = [];
    private threatMap: MaraThreatMap = new MaraThreatMap();
    private cellHeuristics: MaraCellHeuristics = new MaraCellHeuristics();
    private reservedCells: MaraReservedCellData = new MaraReservedCellData();

    private initialLocation: MaraSquadLocation | null = null;
    private lastNonKitedTick: number = Infinity;
    private initialEnemyLocation: MaraPoint | null = null;
    
    OnEntry(): void {
        this.updateThreats();

        if (this.enemyUnits.length == 0) {
            this.squad.Attack(this.squad.CurrentPath!);
            this.squad.SetState(new MaraSquadAttackState(this.squad));
            return;
        }

        this.initialLocation = this.squad.GetLocation();
        this.initialEnemyLocation = this.enemySquads[0].GetLocation().Point;
    }
    
    OnExit(): void {}
    
    Tick(tickNumber: number): void {
        if (this.squad.MovementPath != null) {
            this.squad.SetState(new MaraSquadMoveState(this.squad));
            return;
        }

        if (tickNumber % 10 == 0) {
            if (this.isAtLeastOneUnitAttacking()) {
                this.lastNonKitedTick = tickNumber;
            }
        }

        //if (tickNumber % 10 == 0) { // also micro
        if (tickNumber % 50 == 0) {
            this.updateThreats();
            
            if (
                this.enemyUnits.length == 0 || 
                !this.squad.CanAttackAtLeastOneUnit(this.enemyUnits)
            ) {
                this.squad.Attack(this.squad.CurrentPath!);
                this.squad.SetState(new MaraSquadAttackState(this.squad));
                return;
            }

            if (this.isKitingDetected(tickNumber)) {
                this.squad.SetState(new MaraSquadPullbackState(this.squad, this.initialLocation!.Point));
                return;
            }

            // Temporarily (?) disable proper micro because of it being slow as hell
            //this.distributeTargets();
            //this.distributeTargets_lite();
            this.distributeTargets_liter();
        }
    }

    private isAtLeastOneUnitAttacking(): boolean {
        for (let unit of this.squad.Units) {
            if (MaraUtils.GetUnitTarget(unit) != null) {
                return true;
            }
        }

        return false;
    }

    private isKitingDetected(tickNumber: number): boolean {
        let currentEnemyLocation = this.enemySquads[0].GetLocation().Point;

        let isNoAttackForTooLong = tickNumber - this.lastNonKitedTick >= this.squad.Controller.SquadsSettings.KiteTimeout;
        
        let isEnemyMovedTooFar = 
            MaraUtils.ChebyshevDistance(this.initialEnemyLocation!, currentEnemyLocation) > this.squad.Controller.SquadsSettings.KiteThresholdPositionChangeDistance;

        return isNoAttackForTooLong && isEnemyMovedTooFar;
    }

    private updateThreats(): void {
        let location = this.squad.GetLocation();

        let enemies = MaraUtils.GetSettlementUnitsAroundPoint(
            location.Point, 
            this.squad.Controller.SquadsSettings.EnemySearchRadius, 
            this.squad.Controller.EnemySettlements,
            (unit) => {return MaraUtils.ChebyshevDistance(unit.UnitCell, location.Point) <= this.squad.Controller.SquadsSettings.EnemySearchRadius}
        );

        this.enemySquads = MaraUtils.GetSettlementsSquadsFromUnits(
            enemies, 
            this.squad.Controller.EnemySettlements,
            (unit) => {return MaraUtils.ChebyshevDistance(unit.UnitCell, location.Point) <= this.squad.Controller.SquadsSettings.EnemySearchRadius}
        );

        this.enemyUnits = [];

        for (let squad of this.enemySquads) {
            this.enemyUnits.push(...squad.Units);
        }

        this.updateThreatMap();
    }

    private updateThreatMap(): void {
        this.threatMap = new MaraThreatMap();

        for (let unit of this.enemyUnits) {
            this.addUnitThreatToMap(unit);
        }
    }

    private addUnitThreatToMap(unit: MaraUnitCacheItem): void {
        if (!MaraUtils.IsArmedConfigId(unit.UnitCfgId)) {
            return;
        }

        //TODO: this should also process second armament
        let target = MaraUtils.GetUnitTarget(unit);

        if (target) {
            let unitDps = MaraUnitConfigCache.GetConfigProperty(
                unit.UnitCfgId,
                (cfg) => cfg.MainArmament.ShotParams.Damage as number,
                "Damage"
            ) as number;

            let dispersion = MaraUnitConfigCache.GetConfigProperty(
                unit.UnitCfgId,
                (cfg) => cfg.MainArmament.MaxDistanceDispersion as number,
                "MaxDistanceDispersion"
            ) as number;

            if (dispersion > 0) {
                MaraUtils.ForEachCell(target.Cell, 1, (cell) => {
                    this.threatMap.Add(cell, unitDps);
                });
            }
            else {
                this.threatMap.Add(target.Cell, unitDps);
            }
        }
    }

    private distributeTargets(): void {
        this.squad.Debug(`distrubuting targets. enemies:`);
        
        for (let enemy of this.enemyUnits) {
            this.squad.Debug(enemy.Unit.ToString()!);
        }
        
        this.reservedCells = new MaraReservedCellData();
        
        for (let unit of this.squad.Units) {
            let mainAttackRange = MaraUnitConfigCache.GetConfigProperty(
                unit.UnitCfgId,
                (cfg) => cfg.MainArmament.Range as number,
                "Range"
            ) as number;

            let forestAttackRange = MaraUnitConfigCache.GetConfigProperty(
                unit.UnitCfgId,
                (cfg) => cfg.MainArmament.ForestRange as number,
                "ForestRange"
            ) as number;
            
            let mainVisionRange = MaraUnitConfigCache.GetConfigProperty(
                unit.UnitCfgId,
                (cfg) => cfg.Sight as number,
                "Sight"
            ) as number;

            let forestVisionRange = MaraUnitConfigCache.GetConfigProperty(
                unit.UnitCfgId,
                (cfg) => cfg.ForestVision as number,
                "ForestVision"
            ) as number;

            let optimalTargetData: any = null;
            this.cellHeuristics = new MaraCellHeuristics();
            
            for (let enemy of this.enemyUnits) {
                if (!MaraUnitConfigCache.GetCanAttack(unit.UnitCfgId, enemy.UnitCfgId) || !enemy.UnitIsAlive) {
                    continue;
                }

                if (this.squad.Controller.Settlement.Vision.CanSeeUnit(enemy.Unit)) {
                    mainVisionRange = Infinity;
                    forestVisionRange = Infinity;
                }
                
                let maxCol = enemy.UnitRect.BottomRight.X;
                let maxRow = enemy.UnitRect.BottomRight.Y;

                for (let row = enemy.UnitCell.Y; row <= maxRow; row ++) {
                    for (let col = enemy.UnitCell.X; col <= maxCol; col ++) {
                        let analyzedCell = new MaraPoint(col, row);
                        let atttackRadius = 0;

                        if (MaraMap.GetTileType(analyzedCell) == TileType.Forest) {
                            atttackRadius = Math.min(forestAttackRange, forestVisionRange);
                        }
                        else {
                            atttackRadius = Math.min(mainAttackRange, mainVisionRange);
                        }

                        let analyzedCellDistance = MaraUtils.ChebyshevDistance(unit.UnitCell, analyzedCell);

                        MaraUtils.ForEachCell(analyzedCell, atttackRadius, (cell) => {
                            if (MaraUtils.ChebyshevDistance(unit.UnitCell, cell) > analyzedCellDistance) {
                                return;
                            }
                            
                            let heuristic = this.cellHeuristics.Get(cell);
                            
                            if (heuristic == null) {
                                heuristic = this.calcCellHeuristic(cell, unit);
                                this.cellHeuristics.Set(cell, heuristic);
                            }

                            let targetData = {cell: cell, heuristic: heuristic, target: enemy};

                            if (optimalTargetData == null) {
                                optimalTargetData = targetData;
                            }
                            else if (targetData.heuristic < optimalTargetData.heuristic) {
                                if (MaraUtils.IsCellReachable(cell, unit)) { //!!
                                    optimalTargetData = targetData;
                                }
                            }
                            else if (targetData.heuristic == optimalTargetData.heuristic) {
                                if (targetData.target.UnitHealth < optimalTargetData.target.UnitHealth) {
                                    if (MaraUtils.IsCellReachable(cell, unit)) {
                                        optimalTargetData = targetData;
                                    }
                                }
                            }
                        });
                    }
                }
            }

            if (optimalTargetData) {
                let attackCell = optimalTargetData.target.UnitCell;
                
                if (optimalTargetData.heuristic < Infinity) {
                    if (MaraUtils.ChebyshevDistance(unit.UnitCell, optimalTargetData.cell) > 0) {
                        MaraUtils.IssueMoveCommand([unit], this.squad.Controller.Player, optimalTargetData.cell);
                        MaraUtils.IssueAttackCommand([unit], this.squad.Controller.Player, attackCell, false, false);
                        this.reservedCells.Set(optimalTargetData.cell, true);
                    }
                    else {
                        MaraUtils.IssueAttackCommand([unit], this.squad.Controller.Player, attackCell, true, false);
                    }
                }
                else {
                    MaraUtils.IssueAttackCommand([unit], this.squad.Controller.Player, attackCell);
                }
            }
            else {
                MaraUtils.IssueMoveCommand([unit], this.squad.Controller.Player, unit.UnitCell);
            }
        }
    }

    private distributeTargets_lite(): void {
        this.reservedCells = new MaraReservedCellData();
        
        for (let unit of this.squad.Units) {
            let optimalTargetData: any = null;
            this.cellHeuristics = new MaraCellHeuristics();

            let mainAttackRange = MaraUnitConfigCache.GetConfigProperty(
                unit.UnitCfgId,
                (cfg) => cfg.MainArmament.Range as number,
                "Range"
            ) as number;

            let forestAttackRange = MaraUnitConfigCache.GetConfigProperty(
                unit.UnitCfgId,
                (cfg) => cfg.MainArmament.ForestRange as number,
                "ForestRange"
            ) as number;
            
            let mainVisionRange = MaraUnitConfigCache.GetConfigProperty(
                unit.UnitCfgId,
                (cfg) => cfg.Sight as number,
                "Sight"
            ) as number;

            let forestVisionRange = MaraUnitConfigCache.GetConfigProperty(
                unit.UnitCfgId,
                (cfg) => cfg.ForestVision as number,
                "ForestVision"
            ) as number;

            let optimalEnemy: MaraUnitCacheItem | null = null;
            let shortestDistance = Infinity;
            
            for (let enemy of this.enemyUnits) {
                if (!MaraUnitConfigCache.GetCanAttack(unit.UnitCfgId, enemy.UnitCfgId) || !enemy.UnitIsAlive) {
                    continue;
                }

                let distance = MaraUtils.ChebyshevDistance(unit.UnitCell, enemy.UnitCell);

                if (distance <= shortestDistance) {
                    if (distance < shortestDistance) {
                        optimalEnemy = enemy;
                    }
                    else if (enemy.UnitHealth < optimalEnemy!.UnitHealth) {
                        optimalEnemy = enemy;
                    }
                    
                    shortestDistance = distance;
                }
            }

            if (optimalEnemy) {
                if (this.squad.Controller.Settlement.Vision.CanSeeUnit(optimalEnemy.Unit)) {
                    mainVisionRange = Infinity;
                    forestVisionRange = Infinity;
                }
                
                let maxCol = optimalEnemy.UnitRect.BottomRight.X;
                let maxRow = optimalEnemy.UnitRect.BottomRight.Y;
    
                for (let row = optimalEnemy.UnitRect.TopLeft.Y; row <= maxRow; row++) {
                    for (let col = optimalEnemy.UnitRect.TopLeft.X; col <= maxCol; col++) {
                        let analyzedCell = new MaraPoint(col, row);
                        let atttackRadius = 0;
    
                        if (MaraMap.GetTileType(analyzedCell) == TileType.Forest) {
                            atttackRadius = Math.min(forestAttackRange, forestVisionRange);
                        }
                        else {
                            atttackRadius = Math.min(mainAttackRange, mainVisionRange);
                        }

                        let analyzedCellDistance = MaraUtils.ChebyshevDistance(unit.UnitCell, analyzedCell);
    
                        MaraUtils.ForEachCell(analyzedCell, atttackRadius, (cell) => {
                            if (MaraUtils.ChebyshevDistance(unit.UnitCell, cell) > analyzedCellDistance) {
                                return;
                            }
                            
                            let heuristic = this.cellHeuristics.Get(cell);
                            
                            if (heuristic == null) {
                                heuristic = this.calcCellHeuristic(cell, unit);
                                this.cellHeuristics.Set(cell, heuristic);
                            }
    
                            let targetData = {cell: cell, heuristic: heuristic, target: optimalEnemy};
    
                            if (optimalTargetData == null) {
                                optimalTargetData = targetData;
                            }
                            else if (targetData.heuristic < optimalTargetData.heuristic) {
                                if (MaraUtils.IsCellReachable(cell, unit)) {
                                    optimalTargetData = targetData;
                                }
                            }
                            else if (targetData.heuristic == optimalTargetData.heuristic) {
                                if (targetData.target.UnitHealth < optimalTargetData.target.UnitHealth) {
                                    if (MaraUtils.IsCellReachable(cell, unit)) {
                                        optimalTargetData = targetData;
                                    }
                                }
                            }
                        });
                    }
                }
            }

            if (optimalTargetData) {
                let attackCell = optimalTargetData.target.UnitCell;
                
                if (optimalTargetData.heuristic < Infinity) {
                    if (MaraUtils.ChebyshevDistance(unit.UnitCell, optimalTargetData.cell) > 0) {
                        MaraUtils.IssueMoveCommand([unit], this.squad.Controller.Player, optimalTargetData.cell);
                        MaraUtils.IssueAttackCommand([unit], this.squad.Controller.Player, attackCell, false, false);
                        this.reservedCells.Set(optimalTargetData.cell, true);
                    }
                    else {
                        MaraUtils.IssueAttackCommand([unit], this.squad.Controller.Player, attackCell);
                    }
                }
                else {
                    MaraUtils.IssueAttackCommand([unit], this.squad.Controller.Player, attackCell);
                }
            }
            else {
                MaraUtils.IssueMoveCommand([unit], this.squad.Controller.Player, unit.UnitCell);
            }
        }
    }

    private distributeTargets_liter(): void {
        let attackCell = this.enemySquads[0].GetLocation().Point;

        if (attackCell) {
            MaraUtils.IssueAttackCommand(this.squad.Units, this.squad.Controller.Player, attackCell);
        }
    }

    private calcCellHeuristic(targetCell: IMaraPoint, unit: MaraUnitCacheItem): number {
        let occupyingUnit = MaraUtils.GetUnit(targetCell);
        
        if (occupyingUnit && occupyingUnit.UnitId != unit.UnitId) {
            return Infinity;
        }
        
        if (this.reservedCells.Get(targetCell)) {
            return Infinity;
        }

        let threat = this.threatMap.Get(targetCell);

        return threat + 6 * MaraUtils.ChebyshevDistance(unit.UnitCell, targetCell);
    }
}