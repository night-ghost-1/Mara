import { Mara, MaraLogLevel } from "./Mara";
import { MaraSquad } from "./Subcontrollers/Squads/MaraSquad";
import { createPoint, HordeColor } from "library/common/primitives";
import { UnitFlags, UnitCommand, AllContent, UnitConfig, UnitQueryFlag, UnitSpecification, DrawLayer, FontUtils, GeometryCanvas, Stride_Color, Stride_Vector2, TileType, Scena, ResourceTile, Settlement, Player } from "library/game-logic/horde-types";
import { UnitProducerProfessionParams, UnitProfession } from "library/game-logic/unit-professions";
import { AssignOrderMode, PlayerVirtualInput, VirtualSelectUnitsMode } from "library/mastermind/virtual-input";
import { MaraProductionRequestItem } from "./Common/MaraProductionRequestItem";
import { MaraPoint } from "./Common/MaraPoint";
import { generateCellInSpiral } from "library/common/position-tools";
import { MasterMind, ProduceRequest, ProduceRequestParameters } from "library/mastermind/mastermind-types";
import { enumerate, eNext } from "library/dotnet/dotnet-utils";
import { MaraSettlementData } from "./Common/Settlement/MaraSettlementData";
import { AllowedCompositionItem } from "./Common/AllowedCompositionItem";
import { NonUniformRandomSelectItem } from "./Common/NonUniformRandomSelectItem";
import { UnitComposition } from "./Common/UnitComposition";
import { MaraRect } from "./Common/MaraRect";
import { spawnGeometry, spawnString } from "library/game-logic/decoration-spawn";
import { MaraUnitCache } from "./Common/Cache/MaraUnitCache";
import { MaraUnitConfigCache } from "./Common/Cache/MaraUnitConfigCache";
import { MaraUnitCacheItem } from "./Common/Cache/MaraUnitCacheItem";
import { ListT } from "library/dotnet/dotnet-types";
import { PathFinder } from "library/game-logic/path-find";
import { IMaraPoint } from "./Common/IMaraPoint";

const DEFAULT_UNIT_SEARCH_RADIUS = 3;

const AlmostDefeatCondition = HordeClassLibrary.World.Settlements.Existence.AlmostDefeatCondition;
const ResourceType = HordeClassLibrary.World.Objects.Tiles.ResourceTileType;
const GeometryPresets = HordeClassLibrary.World.Geometry.GeometryPresets;

export { AlmostDefeatCondition }
export { ResourceType }

type UnitsMap = HordeClassLibrary.World.ScenaComponents.Intrinsics.UnitsMap;
type LandscapeMap = HordeClassLibrary.World.ScenaComponents.Scena.ScenaLandscape;
type ResourceMap = HordeClassLibrary.World.ScenaComponents.Scena.ScenaResourcesMap;
type SettlementPopulationCensusModel = HordeClassLibrary.World.Settlements.Models.SettlementPopulationCensusModel;


class DotnetHolder {
    private static realScena: Scena;
    
    public static get RealScena() {
        if (!DotnetHolder.realScena) {
            DotnetHolder.realScena = ActiveScena.GetRealScena();
        }

        return DotnetHolder.realScena;
    }

    private static unitsMap: UnitsMap;
    
    public static get UnitsMap() {
        this.realScena.UnitsMap
        
        if (!DotnetHolder.unitsMap) {
            DotnetHolder.unitsMap = DotnetHolder.RealScena.UnitsMap;
        }
        
        return DotnetHolder.unitsMap;
    }

    private static landscapeMap: LandscapeMap;
    
    public static get LandscapeMap() {
        if (!DotnetHolder.landscapeMap) {
            DotnetHolder.landscapeMap = DotnetHolder.RealScena.LandscapeMap;
        }
        
        return DotnetHolder.landscapeMap;
    }

    private static resourceMap: ResourceMap;

    public static get ResourceMap() {
        if (!DotnetHolder.resourceMap) {
            DotnetHolder.resourceMap = DotnetHolder.RealScena.ResourcesMap;
        }
        
        return DotnetHolder.resourceMap;
    }
}

class PlayerInputCollection {
    [key: string]: PlayerVirtualInput
}

export class MaraUtils {
    //#region Horde Data
    static GetScena(): Scena {
        return DotnetHolder.RealScena;
    }

    static GetScenaWidth(): number {
        return DotnetHolder.RealScena.Size.Width;
    }

    static GetScenaHeigth(): number {
        return DotnetHolder.RealScena.Size.Height;
    }

    static GetCellResourceData(x: number, y: number): ResourceTile {
        return DotnetHolder.ResourceMap.Item.get(x, y);
    }

    static GetAllSettlements(): Array<Settlement> {
        let result: Array<Settlement> = [];

        ForEach(
            DotnetHolder.RealScena.Settlements,
            (s) => result.push(s)
        );
        
        return result;
    }

    static GetAllPlayers(): Array<{index: number, player: Player}> {
        let result: Array<{index: number, player: Player}> = [];

        for (let i = 0; i < Players.length; i ++) {
            let player = Players[i];
            result.push({index: i, player: player});
        }
        
        return result;
    }

    static GetSettlementData(playerId: number): MaraSettlementData | null {
        let realPlayer = Players[playerId].GetRealPlayer();
        if (!realPlayer) {
            return null;
        }

        let settlement = realPlayer.GetRealSettlement();
        let masterMind = ScriptUtils.GetValue(realPlayer, "MasterMind");

        return new MaraSettlementData(settlement, masterMind, realPlayer);
    }

    static IsSettlementDefeated(settlement: Settlement): boolean {
        return settlement.Existence.IsTotalDefeat || settlement.Existence.IsAlmostDefeat;
    }

    static MakeAllowedCfgItems(cfgIds: string[], currentComposition: UnitComposition, settlement: Settlement): AllowedCompositionItem[] {
        let allowedCfgItems = new Array<AllowedCompositionItem>();
        
        for (let cfgId of cfgIds) {
            let cfg = MaraUtils.GetUnitConfig(cfgId);
            
            let currentUnitCount = currentComposition.get(cfgId) ?? 0;
            let unitCountLimit = settlement.RulesOverseer.GetCurrentLimitForUnit(cfg) ?? Infinity;
            let maxUnitCount = Math.max(unitCountLimit - currentUnitCount, 0);

            if (maxUnitCount > 0) {
                allowedCfgItems.push(new AllowedCompositionItem(cfg, maxUnitCount));
            }
        }

        return allowedCfgItems;
    }

    static GetSettlementCensusModel(settlement: Settlement): SettlementPopulationCensusModel {
        return ScriptUtils.GetValue(settlement.Census, "Model");
    }
    //#endregion
    
    //#region Squads and Unit Search
    static GetSettlementsSquadsFromUnits(
        units: Array<MaraUnitCacheItem>, 
        settlements: Array<Settlement>,
        unitFilter?: (unit: MaraUnitCacheItem) => boolean,
        radius: number = DEFAULT_UNIT_SEARCH_RADIUS,
    ): Array<MaraSquad> {
        let processedUnitIds = new Set<number>();
        let result: Array<MaraSquad> = [];
        
        for (let unit of units) {
            if (processedUnitIds.has(unit.UnitId)) {
                continue;
            }

            let squad = MaraUtils.constructMaraSquad(unit, processedUnitIds, settlements, radius, unitFilter);

            if (squad.Units.length > 0) {
                result.push(squad);
            }
        }

        return result;
    }
    
    private static constructMaraSquad(
        unit: MaraUnitCacheItem,
        processedUnitIds: Set<number>, 
        settlements: Array<Settlement>,
        radius: number = DEFAULT_UNIT_SEARCH_RADIUS,
        unitFilter?: (unit: MaraUnitCacheItem) => boolean
    ): MaraSquad {
        let unitSettlement = unit.UnitOwner;

        let newUnitsPresent = true;
        let currentSquad = new MaraSquad([unit]);
        
        while (newUnitsPresent) {
            let squadLocation = currentSquad.GetLocation();
            let newRadius = radius + Math.round(squadLocation.Spread / 2);

            let newUnits = MaraUtils.GetSettlementUnitsAroundPoint(
                squadLocation.SpreadCenter, 
                newRadius,
                settlements,
                unitFilter
            );

            newUnits = newUnits.filter((cacheItem) => {
                return cacheItem.UnitOwner == unitSettlement && 
                    !processedUnitIds.has(cacheItem.UnitId)
            });

            if (newUnits.length == currentSquad.Units.length) {
                newUnitsPresent = false;
            }
            else {
                currentSquad = new MaraSquad(newUnits);
            }
        }

        for (let unit of currentSquad.Units) {
            processedUnitIds.add(unit.UnitId);
        }

        return currentSquad;
    }

    static GetSettlementUnitsAroundPoint(
        point: MaraPoint,
        radius: number,
        settelements?: Array<Settlement>,
        unitFilter?: (unit: MaraUnitCacheItem) => boolean,
        includeUnalive?: boolean
    ): Array<MaraUnitCacheItem> {
        return MaraUtils.GetSettlementUnitsInArea(
            MaraRect.CreateFromPoint(point, radius),
            settelements,
            unitFilter,
            includeUnalive
        );
    }
    
    static GetSettlementUnitsInArea(
        rect: MaraRect,
        settelements?: Array<Settlement>,
        unitFilter?: (unit: MaraUnitCacheItem) => boolean,
        includeUnalive?: boolean
    ): Array<MaraUnitCacheItem> {
        let units: Array<MaraUnitCacheItem>;

        if (settelements) {
            units = MaraUnitCache.GetSettlementsUnitsInArea(rect, settelements, unitFilter);
        }
        else {
            units = MaraUnitCache.GetAllUnitsInArea(rect, unitFilter);
        }

        units = units.filter((cacheItem) => {
            return (
                (cacheItem.Unit.IsAlive || includeUnalive) && 
                MaraUtils.IsActiveConfigId(cacheItem.UnitCfgId)
            );
        });

        return units;
    }

    static GetAllSettlementUnits(settlement: Settlement): Array<MaraUnitCacheItem> {
        let allUnits = MaraUnitCache.GetAllSettlementUnits(settlement);
        
        return allUnits.filter((unit) => unit.UnitIsAlive);
    }

    static GetUnitsAroundPoint(point: MaraPoint, radius: number, unitFilter?: (unit: MaraUnitCacheItem) => boolean): Array<MaraUnitCacheItem> {
        return MaraUtils.GetUnitsInArea(
            MaraRect.CreateFromPoint(point, radius),
            unitFilter
        );
    }
    
    static GetUnitsInArea(rect: MaraRect, unitFilter?: (unit: MaraUnitCacheItem) => boolean): Array<MaraUnitCacheItem> {
        return MaraUnitCache.GetAllUnitsInArea(rect, unitFilter);
    }

    static GetUnit(point: IMaraPoint): MaraUnitCacheItem | null {
        let pointTyped = new MaraPoint(point.X, point.Y);
        let rect = new MaraRect(pointTyped, pointTyped);
        
        let cacheItems = MaraUnitCache.GetAllUnitsInArea(rect);

        if (cacheItems.length > 0) {
            let upperUnit = MaraUtils.FindExtremum(cacheItems, (a, b) => {
                return ((a.UnitMapLayer as unknown) as number) - ((b.UnitMapLayer as unknown) as number)
            })!;
            
            return upperUnit;
        }
        else {
            return null;
        }
    }
    //#endregion
    
    //#region Cells & Tiles
    // This has neat side effect that resulting cells are ordered from closest to farthest from center
    static FindCells(
        center: MaraPoint, 
        radius: number, 
        filter: (cell: MaraPoint) => boolean
    ): Array<MaraPoint> {
        let result: MaraPoint[] = [];
        
        let generator = generateCellInSpiral(center.X, center.Y);
        let cell: any;
        
        for (cell = generator.next(); !cell.done; cell = generator.next()) {
            let point = new MaraPoint(cell.value.X, cell.value.Y);

            if (MaraUtils.ChebyshevDistance(point, center) > radius) {
                return result;
            }

            if ( filter(point) ) {
                result.push(point);
            }
        }

        return result;
    }

    static GetBoundingRect(points: Array<MaraPoint>): MaraRect {
        let topPoint: MaraPoint = new MaraPoint(Infinity, Infinity);
        let bottomPoint: MaraPoint = new MaraPoint(0, 0);
        let leftPoint: MaraPoint = new MaraPoint(Infinity, Infinity);
        let rightPoint: MaraPoint = new MaraPoint(0, 0);

        for (let point of points) {
            if (point.Y < topPoint.Y) {
                topPoint = point;
            }

            if (point.X < leftPoint.X) {
                leftPoint = point;
            }

            if (point.Y > bottomPoint.Y) {
                bottomPoint = point;
            }

            if (point.X > rightPoint.X) {
                rightPoint = point;
            }
        }

        return new MaraRect(
            new MaraPoint(leftPoint.X, topPoint.Y),
            new MaraPoint(rightPoint.X, bottomPoint.Y)
        );
    }

    static GetUnitsBoundingRect(units: Array<MaraUnitCacheItem>): MaraRect {
        let topPoint: MaraPoint = new MaraPoint(Infinity, Infinity);
        let bottomPoint: MaraPoint = new MaraPoint(0, 0);
        let leftPoint: MaraPoint = new MaraPoint(Infinity, Infinity);
        let rightPoint: MaraPoint = new MaraPoint(0, 0);

        for (let unit of units) {
            if (unit.UnitCell.Y < topPoint.Y) {
                topPoint = unit.UnitCell;
            }

            if (unit.UnitCell.X < leftPoint.X) {
                leftPoint = unit.UnitCell;
            }

            if (unit.UnitRect.BottomRight.Y > bottomPoint.Y) {
                bottomPoint = unit.UnitRect.BottomRight;
            }

            if (unit.UnitRect.BottomRight.X > rightPoint.X) {
                rightPoint = unit.UnitRect.BottomRight;
            }
        }

        return new MaraRect(
            new MaraPoint(leftPoint.X, topPoint.Y),
            new MaraPoint(rightPoint.X, bottomPoint.Y)
        );
    }

    static FindClosestCell(
        center: MaraPoint, 
        radius: number, 
        predicate: (cell: MaraPoint) => boolean
    ): MaraPoint | null {
        let generator = generateCellInSpiral(center.X, center.Y);
        let cell: any;

        for (cell = generator.next(); !cell.done; cell = generator.next()) {
            let point = new MaraPoint(cell.value.X, cell.value.Y);

            if (MaraUtils.ChebyshevDistance(point, center) > radius) {
                return null;
            }

            if ( predicate(point) ) {
                return point;
            }
        }

        return null;
    }

    static GetTileType(point: {X: number; Y: number;}): TileType | null {
        if (
            0 <= point.X && point.X < DotnetHolder.RealScena.Size.Width &&
            0 <= point.Y && point.Y < DotnetHolder.RealScena.Size.Height
        ) {
            let tile = DotnetHolder.LandscapeMap.Item.get(point.X, point.Y);

            return tile.Cfg.Type;
        }
        else {
            return null;
        }
    }

    // finds a free cell nearest to given
    static FindFreeCell(point: MaraPoint): MaraPoint | null {
        let generator = generateCellInSpiral(point.X, point.Y);
        let cell: any;

        for (cell = generator.next(); !cell.done; cell = generator.next()) {
            let checkedPoint = new MaraPoint(cell.value.X, cell.value.Y);
            let unit = MaraUtils.GetUnit(checkedPoint);
            
            if (!unit) {
                let neighbors = MaraUtils.GetUnitsAroundPoint(checkedPoint, 1);

                let isTargetedCell = false;

                for (let neighbor of neighbors) {
                    if (neighbor.Unit.MoveToCell) {
                        if (
                            neighbor.Unit.MoveToCell.X == checkedPoint.X && 
                            neighbor.Unit.MoveToCell.Y == checkedPoint.Y
                        ) {
                            isTargetedCell = true;
                            break;
                        }
                    }
                }
                
                if (!isTargetedCell) {
                    return checkedPoint;
                }
            }
        }

        return null;
    }

    static ForEachCell(center: IMaraPoint, radius: number, action: (cell: IMaraPoint) => void): void {
        let endRow = Math.min(center.Y + radius, DotnetHolder.RealScena.Size.Height - 1);
        let endCol = Math.min(center.X + radius, DotnetHolder.RealScena.Size.Width - 1);
        
        for (
            let row = Math.max(center.Y - radius, 0);
            row <= endRow;
            row ++
        ) {
            for (
                let col = Math.max(center.X - radius, 0);
                col <= endCol;
                col ++
            ) {
                action({X: col, Y: row});
            }
        }
    }

    static WaveOverCells(
        cells: MaraPoint[], 
        waveContinueCondition: (cell: MaraPoint, neighbourCell: MaraPoint) => boolean,
        onFrontFinish: (cells: MaraPoint[]) => void,
        onWaveFinish: (cells: MaraPoint[]) => void
    ): void {
        let cellsIndex = new Set(cells.map((cell) => cell.ToString()));
        let processedCells = new Set<string>();
        
        for (let initialCell of cells) {
            if (!waveContinueCondition(initialCell, initialCell)) {
                continue;
            }
            
            let nextCells: Array<MaraPoint> = [initialCell];
            let waveCells: Array<MaraPoint> = [];
    
            while (nextCells.length > 0) {
                let currentCells = [...nextCells];
                nextCells = [];
                let curIterationCells: MaraPoint[] = [];
    
                for (let cell of currentCells) {
                    let cellStr = cell.ToString();
                    
                    if (processedCells.has(cellStr)) {
                        continue;
                    }
    
                    processedCells.add(cellStr);
    
                    if (cellsIndex.has(cellStr)) {
                        curIterationCells.push(cell);
    
                        MaraUtils.ForEachCell(
                            cell, 
                            1, 
                            (nextCell) => {
                                let point = new MaraPoint(nextCell.X, nextCell.Y);
    
                                if (
                                    cellsIndex.has(point.ToString()) && 
                                    !processedCells.has(point.ToString()) &&
                                    point.X == cell.X || point.Y == cell.Y
                                ) {
                                    if (waveContinueCondition(cell, point)) {
                                        nextCells.push(point);
                                    }
                                }
                            }
                        );
                    }
                }
    
                onFrontFinish(curIterationCells);
                waveCells.push(...curIterationCells);
            }
    
            onWaveFinish(waveCells);
        }
    }
    //#endregion
    
    //#region Unit Composition Data Structure
    static PrintMap(map: UnitComposition): void {
        map.forEach(
            (value, key, m) => {
                Mara.Log(MaraLogLevel.Debug, `${key}: ${value}`);
            }
        )
    }

    static IncrementMapItem(map: UnitComposition, key: string): void {
        MaraUtils.AddToMapItem(map, key, 1);
    }

    static DecrementMapItem(map: UnitComposition, key: string): void {
        if (map.has(key)) {
            map.set(key, Math.max(map.get(key)! - 1, 0));
        }
    }

    static AddToMapItem(map: UnitComposition, key: string, value: number): void {
        if (map.has(key)) {
            map.set(key, (map.get(key) ?? 0) + value);
        }
        else {
            map.set(key, value);
        }
    }

    static SubstractCompositionLists(
        minuend: UnitComposition, 
        subtrahend: UnitComposition
    ): UnitComposition {
        let newList = new Map<string, number>();

        minuend.forEach(
            (value, key, map) => {
                if (subtrahend.has(key)) {
                    let newCount = value - (subtrahend.get(key) ?? 0);
                    
                    if (newCount > 0) {
                        newList.set(key, newCount);
                    }
                }
                else {
                    newList.set(key, value);
                }
            }
        );

        return newList;
    }
    //#endregion
    
    //#region RNG Utils
    static Random(masterMind: MasterMind, max: number, min: number = 0) {
        let rnd = masterMind.Randomizer;
        return rnd.RandomNumber(min, max);
    }

    static RandomSelect<Type>(masterMind: MasterMind, items: Array<Type>): Type | null {
        let index = 0; 
        
        if (items.length == 0) {
            return null;
        } 
        else if (items.length > 1) {
            index = MaraUtils.Random(masterMind, items.length - 1);
        }

        return items[index];
    }

    static NonUniformRandomSelect<Type extends NonUniformRandomSelectItem>(
        masterMind: MasterMind, 
        items: Array<Type>
    ): Type | null {
        if (items.length == 0) {
            return null;
        }
        
        let upperBound = 0;

        for (let item of items) {
            upperBound += item.Weight;
        }

        let pick = MaraUtils.Random(masterMind, upperBound);

        let accumulatedBound = 0;

        for (let item of items) {
            accumulatedBound += item.Weight;

            if (pick <= accumulatedBound) {
                return item;
            }
        }

        return items[0];
    }
    //#endregion
    
    //#region Tech Chain
    private static getTechChain(cfg: UnitConfig, settlement: Settlement): System.Collections.Generic.HashSet<UnitConfig> {
        return settlement.TechTree.GetUnmetRequirements(cfg);
    }
    
    private static getProductionChain(cfg: UnitConfig, settlement: Settlement): System.Collections.Generic.List<UnitConfig> {
        let list = new ListT(UnitConfig) as System.Collections.Generic.List<UnitConfig>;
    
        settlement.TechTree.HypotheticalProducts.WhoCanProduce(cfg, list);
    
        return list;
    }
    
    public static GetCfgIdProductionChain(cfgId: string, settlement: Settlement): Array<UnitConfig> {
        let config = MaraUtils.GetUnitConfig(cfgId);

        let chain = new Map<string, UnitConfig>();
        let nextLevel = [config];

        do {
            let currentLevel = nextLevel;
            nextLevel = [];

            for (let config of currentLevel) {
                let techItems = MaraUtils.getTechChain(config, settlement);

                ForEach(
                    techItems, 
                    (item) => {
                        if (!chain.has(item.Uid)) {
                            chain.set(item.Uid, item);
                            nextLevel.push(item);
                        }
                    }
                );

                let productionItems = MaraUtils.getProductionChain(config, settlement);

                ForEach(
                    productionItems, 
                    (item) => {
                        if (!chain.has(item.Uid)) {
                            chain.set(item.Uid, item);
                            nextLevel.push(item);
                        }
                    }
                );
            }
        }
        while (nextLevel.length > 0);

        let result = Array.from(chain.values());
        result = result.filter((v) => v.Uid != cfgId);

        return result;
    }
    //#endregion
    
    //#region Unit Commands
    static IssueAttackCommand(
        units: Array<MaraUnitCacheItem>, 
        player: Player, 
        location: IMaraPoint, 
        isReplaceMode: boolean = true, 
        ignoreUnits: boolean = true
    ): void {
        MaraUtils.issuePointBasedCommand(units, player, location, UnitCommand.Attack, isReplaceMode, ignoreUnits);
    }

    static IssueMoveCommand(units: Array<MaraUnitCacheItem>, player: Player, location: IMaraPoint, isReplaceMode: boolean = true): void {
        MaraUtils.issuePointBasedCommand(units, player, location, UnitCommand.MoveToPoint, isReplaceMode);
    }

    static IssueCaptureCommand(units: Array<MaraUnitCacheItem>, player: Player, location: IMaraPoint, isReplaceMode: boolean = true): void {
        MaraUtils.issuePointBasedCommand(units, player, location, UnitCommand.Capture, isReplaceMode);
    }

    static IssueHarvestLumberCommand(units: Array<MaraUnitCacheItem>, player: Player, location: IMaraPoint, isReplaceMode: boolean = true): void {
        MaraUtils.issuePointBasedCommand(units, player, location, UnitCommand.HarvestLumber, isReplaceMode);
    }

    static IssueMineCommand(units: Array<MaraUnitCacheItem>, player: Player, location: IMaraPoint, isReplaceMode: boolean = true): void {
        MaraUtils.issuePointBasedCommand(units, player, location, UnitCommand.Mine, isReplaceMode);
    }

    static IssueRepairCommand(units: Array<MaraUnitCacheItem>, player: Player, location: IMaraPoint, isReplaceMode: boolean = true): void {
        MaraUtils.issuePointBasedCommand(units, player, location, UnitCommand.Repair, isReplaceMode);
    }

    static IssueSelfDestructCommand(units: Array<MaraUnitCacheItem>, player: Player) {
        MaraUtils.issueOneClickCommand(units, player, UnitCommand.DestroySelf);
    }

    private static issueOneClickCommand(units: Array<MaraUnitCacheItem>, player: Player, command: UnitCommand): void {
        let virtualInput = MaraUtils.playersInput[player.Guid];
        
        if (!virtualInput) {
            virtualInput = new PlayerVirtualInput(player);
            MaraUtils.playersInput[player.Guid] = virtualInput;
        }

        let unitIds = units.map((unit) => unit.UnitId);
        virtualInput.selectUnitsById(unitIds, VirtualSelectUnitsMode.Select);
        virtualInput.oneClickCommand(command);
    }

    private static issuePointBasedCommand(
        units: Array<MaraUnitCacheItem>, 
        player: Player, 
        location: IMaraPoint, 
        command: UnitCommand, 
        isReplaceMode: boolean = true,
        ignoreUnits: boolean = false
    ): void {
        let virtualInput = MaraUtils.playersInput[player.Guid];
        
        if (!virtualInput) {
            virtualInput = new PlayerVirtualInput(player);
            MaraUtils.playersInput[player.Guid] = virtualInput;
        }

        let mode = isReplaceMode ? AssignOrderMode.Replace : AssignOrderMode.Queue;
        let unitIds = units.map((unit) => unit.UnitId);
        
        virtualInput.selectUnitsById(unitIds, VirtualSelectUnitsMode.Select);
        virtualInput.pointBasedCommand(createPoint(location.X, location.Y), command, mode, ignoreUnits);
        virtualInput.commit();
    }

    private static playersInput: PlayerInputCollection = {};
    //#endregion
    
    //#region Pathfinding
    static IsCellReachable(cell: IMaraPoint, unit: MaraUnitCacheItem): boolean {
        return unit.Unit.MapMind.CheckPathTo(createPoint(cell.X, cell.Y), false).Found;
    }

    static IsPathExists(fromCell: MaraPoint, toCell: MaraPoint, unitCfg: UnitConfig, pathFinder: PathFinder): boolean {
        let from = createPoint(fromCell.X, fromCell.Y);
        let to = createPoint(toCell.X, toCell.Y);
        
        return pathFinder.checkPath(unitCfg, from, to);
    }
    //#endregion
    
    //#region Unit Properties
    static GetUnitTarget(unit: MaraUnitCacheItem): HordeClassLibrary.World.Objects.Units.IKnownOrRealUnit {
        return unit.Unit.OrdersMind.GetCurrentHitTarget();
    }

    static GetUnitPathLength(unit: MaraUnitCacheItem): number | null {
        return unit.Unit.OrdersMind.GetCurrentPathLength();
    }

    static GetUnitStrength(unit: MaraUnitCacheItem): number {
        let maxStrength = MaraUtils.GetConfigIdStrength(unit.UnitCfgId);
        let maxHealth = MaraUtils.GetConfigIdMaxHealth(unit.UnitCfgId);

        return maxStrength * (unit.UnitHealth / maxHealth);
    }

    static CanAttack(sourceUnit: MaraUnitCacheItem, targetUnit: MaraUnitCacheItem): boolean {
        let sourceCfgId = sourceUnit.UnitCfgId;
        let targetCfgId = targetUnit.UnitCfgId;

        let result: boolean | undefined = MaraUnitConfigCache.GetCanAttack(sourceCfgId, targetCfgId);

        if (result == undefined) {
            result = sourceUnit.Unit.BattleMind.CanAttackTarget(targetUnit.Unit);
            MaraUnitConfigCache.SetCanAttack(sourceCfgId, targetCfgId, result as boolean);
        }

        return result!;
    }
    //#endregion
    
    //#region Unit Configs
    static GetUnitConfig(configId: string): UnitConfig {
        return HordeContentApi.GetUnitConfig(configId);
    }

    private static configHasProfession(unitConfig: UnitConfig, profession: UnitProfession): boolean {
        let professionParams = unitConfig.GetProfessionParams(profession, true);

        return (professionParams != null);
    }

    static IsAllDamagerConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isAllDamagerConfig, "isAllDamagerConfig") as boolean;
    }

    private static isAllDamagerConfig(unitConfig: UnitConfig): boolean {
        let mainArmament = unitConfig.MainArmament;

        if (mainArmament) {
            return mainArmament.BulletConfig.DisallowedTargets == UnitQueryFlag.None;
        }
        else {
            return false;
        }
    }

    static IsActiveConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isActiveConfig, "isActiveConfig") as boolean;
    }

    private static isActiveConfig(unitConfig: UnitConfig): boolean {
        return unitConfig.HasNotFlags(UnitFlags.Passive);
    }

    static IsArmedConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isArmedConfig, "isArmedConfig") as boolean;
    }

    private static isArmedConfig(unitConfig: UnitConfig): boolean {
        let mainArmament = unitConfig.MainArmament;
        return mainArmament != null;
    }

    static IsCombatConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isCombatConfig, "isCombatConfig") as boolean;
    }

    private static isCombatConfig(unitConfig: UnitConfig): boolean {
        let mainArmament = unitConfig.MainArmament;
        let isHarvester = MaraUtils.configHasProfession(unitConfig, UnitProfession.Harvester);

        return mainArmament != null && !isHarvester;
    }

    static IsCapturingConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isCapturingConfig, "isCapturingConfig") as boolean;
    }

    private static isCapturingConfig(unitConfig: UnitConfig): boolean {
        return unitConfig.AllowedCommands.ContainsKey(UnitCommand.Capture);
    }

    static IsProducerConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isProducerConfig, "isProducerConfig") as boolean;
    }

    private static isProducerConfig(cfg: UnitConfig): boolean {
        return MaraUtils.configHasProfession(cfg, UnitProfession.UnitProducer);
    }

    static IsTechConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isTechConfig, "isTechConfig") as boolean;
    }

    private static isTechConfig(cfg: UnitConfig): boolean {
        let unitConfigs = enumerate(AllContent.UnitConfigs.Configs);
        let kv;
        
        while ((kv = eNext(unitConfigs)) !== undefined) {
            let config = kv.Value;

            let productionRequirements = enumerate(config!.TechConfig?.Requirements);
            let requirementConfig;

            while ((requirementConfig = eNext(productionRequirements)) !== undefined) {
                if (requirementConfig.Uid == cfg.Uid) {
                    return true;
                }
            }
        }
        
        return false;
    }

    static IsBuildingConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isBuildingConfig, "isBuildingConfig") as boolean;
    }

    private static isBuildingConfig(unitConfig: UnitConfig): boolean {
        return unitConfig.BuildingConfig != null && unitConfig.HasNotFlags(UnitFlags.Passive);
    }

    static IsMineConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isMineConfig, "isMineConfig") as boolean;
    }

    private static isMineConfig(unitConfig: UnitConfig): boolean {
        return MaraUtils.configHasProfession(unitConfig, UnitProfession.Mine);
    }

    static IsSawmillConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isSawmillConfig, "isSawmillConfig") as boolean;
    }

    private static isSawmillConfig(unitConfig: UnitConfig): boolean {
        return MaraUtils.configHasProfession(unitConfig, UnitProfession.Sawmill);
    }

    static IsHarvesterConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isHarvesterConfig, "isHarvesterConfig") as boolean;
    }

    private static isHarvesterConfig(unitConfig: UnitConfig): boolean {
        return MaraUtils.configHasProfession(unitConfig, UnitProfession.Harvester);
    }

    static IsHousingConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isHousingConfig, "isHousingConfig") as boolean;
    }

    private static isHousingConfig(unitConfig: UnitConfig): boolean {
        return unitConfig.ProducedPeople > 0 && !MaraUtils.isMetalStockConfig(unitConfig);
    }

    static IsMetalStockConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isMetalStockConfig, "isMetalStockConfig") as boolean;
    }

    private static isMetalStockConfig(unitConfig: UnitConfig): boolean {
        return MaraUtils.configHasProfession(unitConfig, UnitProfession.MetalStock);
    }

    static IsEconomyBoosterConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isEconomyBoosterConfig, "isDevelopmentBoosterConfig") as boolean;
    }

    private static isEconomyBoosterConfig(unitConfig: UnitConfig): boolean {
        return unitConfig.Specification.HasFlag(UnitSpecification.MaxGrowthSpeedIncrease);
    }

    static IsHealerConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isHealerConfig, "isHealerConfig") as boolean;
    }

    private static isHealerConfig(unitConfig: UnitConfig): boolean {
        // this is wrong, but we don't have a decent way to detect healing capabilities of a unit,
        // so this'll have to do
        return unitConfig.Specification.HasFlag(UnitSpecification.Church);
    }

    static IsWalkableConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isWalkableConfig, "IsWalkableConfig") as boolean;
    }

    private static isWalkableConfig(unitConfig: UnitConfig): boolean {
        return unitConfig.BuildingConfig != null && unitConfig.HasFlags(UnitFlags.Walkable);
    }

    static IsReparableConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isReparableConfig, "isReparable") as boolean;
    }

    private static isReparableConfig(unitConfig: UnitConfig): boolean {
        return MaraUtils.configHasProfession(unitConfig, UnitProfession.Reparable);
    }

    static IsRepairerConfigId(cfgId: string): boolean {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.isRepairerConfig, "isRepairer") as boolean;
    }

    private static isRepairerConfig(unitConfig: UnitConfig): boolean {
        return unitConfig.AllowedCommands.ContainsKey(UnitCommand.Repair);
    }

    static GetAllSawmillConfigIds(settlement: Settlement): Array<string> {
        return MaraUtils.GetAllConfigIds(settlement, MaraUtils.isSawmillConfig, "isSawmillConfig");
    }

    static GetAllMineConfigIds(settlement: Settlement): Array<string> {
        return MaraUtils.GetAllConfigIds(settlement, MaraUtils.isMineConfig, "isMineConfig");
    }

    static GetAllHarvesterConfigIds(settlement: Settlement): Array<string> {
        return MaraUtils.GetAllConfigIds(settlement, MaraUtils.isHarvesterConfig, "isHarvesterConfig");
    }

    static GetAllHousingConfigIds(settlement: Settlement): Array<string> {
        return MaraUtils.GetAllConfigIds(settlement, MaraUtils.isHousingConfig, "isHousingConfig");
    }

    static GetAllMetalStockConfigIds(settlement: Settlement): Array<string> {
        return MaraUtils.GetAllConfigIds(settlement, MaraUtils.isMetalStockConfig, "isMetalStockConfig");
    }

    static GetAllEconomyBoosterConfigIds(settlement: Settlement): Array<string> {
        return MaraUtils.GetAllConfigIds(settlement, MaraUtils.isEconomyBoosterConfig, "isDevelopmentBoosterConfig");
    }

    static GetAllHealerConfigIds(settlement: Settlement): Array<string> {
        return MaraUtils.GetAllConfigIds(settlement, MaraUtils.isHealerConfig, "isHealerConfig");
    }

    static GetAllConfigIds(settlement: Settlement, configFilter: (config: UnitConfig) => boolean, propertyName: string): Array<string> {
        let result: Array<string> = [];

        let allConfigs = MaraUnitConfigCache.GetAllConfigs();

        allConfigs.forEach((uCfg, cfgId) => {
            let propertyValue = MaraUnitConfigCache.GetConfigProperty(cfgId, configFilter, propertyName) as boolean;
            
            if (
                propertyValue &&
                settlement.TechTree.HypotheticalProducts.CanProduce(uCfg)
            ) {
                result.push(cfgId);
            }
        });

        return result;
    }

    static GetConfigIdStrength(cfgId: string): number {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.configStrength, "configStrength") as number
    }

    private static configStrength(unitConfig: UnitConfig): number {
        if (MaraUtils.isArmedConfig(unitConfig)) {
            return unitConfig.MaxHealth * Math.sqrt(unitConfig.Shield + 1);
        }
        else {
            return 0;
        }
    }

    static GetConfigIdMaxHealth(cfgId: string): number {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.configMaxHealth, "configMaxHealth") as number
    }

    private static configMaxHealth(unitConfig: UnitConfig): number {
        return unitConfig.MaxHealth;
    }

    static GetConfigIdHeight(cfgId: string): number {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.configHeight, "configHeight") as number
    }

    private static configHeight(unitConfig: UnitConfig): number {
        return unitConfig.Size.Height;
    }

    static GetConfigIdWidth(cfgId: string): number {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.configWidth, "configWidth") as number
    }

    private static configWidth(unitConfig: UnitConfig): number {
        return unitConfig.Size.Width;
    }

    static GetConfigIdProducedConfigIds(cfgId: string): Array<string> {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.configProducedConfigIds, "configProducedConfigIds") as Array<string>
    }

    private static configProducedConfigIds(unitConfig: UnitConfig): Array<string> {
        let producerParams = unitConfig.GetProfessionParams(UnitProducerProfessionParams, UnitProfession.UnitProducer, true) as UnitProducerProfessionParams;
        let producedCfgIds: Array<string> = [];
    
        if (producerParams) {
            let produceList = enumerate(producerParams.CanProduceList);
            let produceListItem;

            while ((produceListItem = eNext(produceList)) !== undefined) {
                producedCfgIds.push(produceListItem!.Uid);
            }
        }

        return producedCfgIds;
    }

    static GetConfigIdMoveType(cfgId: string): string {
        return MaraUnitConfigCache.GetConfigProperty(cfgId, MaraUtils.configMoveType, "configMoveType") as string;
    }

    private static configMoveType(unitConfig: UnitConfig): string {
        let unitCfgId = unitConfig.Uid;
        let moveType = "";
                
        moveType += MaraUtils.speedToMoveTypeFlag(MaraUnitConfigCache.GetConfigProperty(unitCfgId, (cfg) => cfg.Speeds.Item.get(TileType.Grass) as number,  "GrassSpeed") as number);
        moveType += MaraUtils.speedToMoveTypeFlag(MaraUnitConfigCache.GetConfigProperty(unitCfgId, (cfg) => cfg.Speeds.Item.get(TileType.Forest) as number, "ForestSpeed") as number);
        moveType += MaraUtils.speedToMoveTypeFlag(MaraUnitConfigCache.GetConfigProperty(unitCfgId, (cfg) => cfg.Speeds.Item.get(TileType.Water) as number,  "WaterSpeed") as number);
        moveType += MaraUtils.speedToMoveTypeFlag(MaraUnitConfigCache.GetConfigProperty(unitCfgId, (cfg) => cfg.Speeds.Item.get(TileType.Marsh) as number,  "MarshSpeed") as number);
        moveType += MaraUtils.speedToMoveTypeFlag(MaraUnitConfigCache.GetConfigProperty(unitCfgId, (cfg) => cfg.Speeds.Item.get(TileType.Sand) as number,   "SandSpeed") as number);
        moveType += MaraUtils.speedToMoveTypeFlag(MaraUnitConfigCache.GetConfigProperty(unitCfgId, (cfg) => cfg.Speeds.Item.get(TileType.Mounts) as number, "MountsSpeed") as number);
        moveType += MaraUtils.speedToMoveTypeFlag(MaraUnitConfigCache.GetConfigProperty(unitCfgId, (cfg) => cfg.Speeds.Item.get(TileType.Road) as number,   "RoadSpeed") as number);
        moveType += MaraUtils.speedToMoveTypeFlag(MaraUnitConfigCache.GetConfigProperty(unitCfgId, (cfg) => cfg.Speeds.Item.get(TileType.Ice) as number,    "IceSpeed") as number);

        return moveType;
    }

    private static speedToMoveTypeFlag(speed: number): string {
        if (speed > 0) {
            return "1";
        }
        else {
            return "0";
        }
    }
    //#endregion
    
    //#region General Utils
    static ChebyshevDistance(cell1: IMaraPoint, cell2: IMaraPoint): number {
        const xDiff = Math.abs(cell1.X - cell2.X);
        const yDiff = Math.abs(cell1.Y - cell2.Y);

        return Math.max(xDiff, yDiff);
    }

    static EuclidDistance(cell1: IMaraPoint, cell2: IMaraPoint): number {
        return Math.sqrt(
            (cell1.X - cell2.X) ** 2 +
            (cell1.Y - cell2.Y) ** 2
        )
    }

    static FindExtremum<Type>(
        items: Array<Type>, 
        compareFunc: (candidate: Type, currentExtremum: Type) => number
    ): Type | null {
        if (items.length == 0) {
            return null;
        }
    
        let result = items[0];
    
        for (let item of items) {
            let compareResult = compareFunc(item, result);
    
            if (compareResult > 0) {
                result = item;
            }
        }
    
        return result;
    }

    // Bresenham algorithm to pixelize straight lines are used here
    // see https://ru.wikipedia.org/wiki/Алгоритм_Брезенхэма for details
    private static bresenhamLine(start: MaraPoint, end: MaraPoint): Array<MaraPoint> {
        let xDelta = Math.abs(end.X - start.X);
        let yDelta = Math.abs(end.Y - start.Y);
        
        let error = 0;
        let errDelta = yDelta + 1;
        
        let y = start.Y;
        let yDir = Math.sign(end.Y - start.Y);

        let result: Array<MaraPoint> = [];

        for (let x = start.X; x <= end.X; x ++) {
            result.push(new MaraPoint(x, y));

            error = error + errDelta;

            if (error >= xDelta + 1) {
                y += yDir;
                error -= xDelta + 1;
            }
        }

        return result;
    }

    static MakeLine(point1: MaraPoint, point2: MaraPoint): Array<MaraPoint> {
        if (point1.X == point2.X) {
            let result: Array<MaraPoint> = [];
            let yDelta = Math.sign(point2.Y - point1.Y);
            
            for (let y = point1.Y; y != point2.Y; y += yDelta) {
                result.push(new MaraPoint(point1.X, y));
            }

            result.push(new MaraPoint(point1.X, point2.Y));

            return result;
        }
        else {
            let result: Array<MaraPoint> = [];

            if (Math.abs(point1.X - point2.X) < Math.abs(point1.Y - point2.Y)) {
                let cells = MaraUtils.MakeLine(new MaraPoint(point1.Y, point1.X), new MaraPoint(point2.Y, point2.X));
                result = cells.map((cell) => new MaraPoint(cell.Y, cell.X));
            }
            else {
                if (point2.X > point1.X) {
                    result = MaraUtils.bresenhamLine(point1, point2);
                }
                else {
                    result = MaraUtils.bresenhamLine(point2, point1);
                }
            }

            // update result so that all cells are strictly connected via sides, not diagonals
            // let newCells: Array<MaraPoint> = [];

            // for (let i = 0; i < result.length - 1; i ++) {
            //     let curCell = result[i];
            //     let nextCell = result[i + 1];

            //     if (
            //         curCell.X != nextCell.X && 
            //         curCell.Y != nextCell.Y
            //     ) {
            //         let xDelta = Math.sign(nextCell.X - curCell.X);

            //         newCells.push(
            //             new MaraPoint(curCell.X + xDelta, curCell.Y)
            //         );
            //     }
            // }

            // result.push(...newCells);

            return result;
        }
    }

    static RequestMasterMindProduction(
        productionRequestItem: MaraProductionRequestItem, 
        executor: MaraUnitCacheItem,
        masterMind: MasterMind, 
        checkDuplicate: boolean = false
    ): boolean {
        let cfg = MaraUtils.GetUnitConfig(productionRequestItem.ConfigId);

        let produceRequestParameters = new ProduceRequestParameters(cfg, 1);
        produceRequestParameters.CheckExistsRequest = checkDuplicate;
        produceRequestParameters.AllowAuxiliaryProduceRequests = false;
        produceRequestParameters.Producer = executor.Unit;
        
        if (productionRequestItem.Point) {
            produceRequestParameters.TargetCell = createPoint(productionRequestItem.Point.X, productionRequestItem.Point.Y);
        }

        produceRequestParameters.MaxRetargetAttempts = productionRequestItem.Precision;
        produceRequestParameters.DisableBuildPlaceChecking = productionRequestItem.Precision == 0;

        let addedRequest = host.newVar(ProduceRequest) as HostVariable<ProduceRequest>;
        
        if (masterMind.ProductionDepartment.AddRequestToProduce(produceRequestParameters, addedRequest.out)) {
            productionRequestItem.MasterMindRequest = addedRequest.value;
            return true;
        }
        else {
            return false;
        }
    }

    static GetPropertyValue(object: any, propertyName: string): any {
        return ScriptUtils.GetValue(object, propertyName);
    }

    static CastToType(object: any, type: any): any {
        try {
            return host.cast(type, object);
        }
        catch (e) {
            return null;
        }
    }
    //#endregion

    //#region Debug Utils
    static TextOnMap(text: string, cell: MaraPoint, color: HordeColor): void {
        let position = GeometryPresets.CellToCenterPosition(createPoint(cell.X, cell.Y));
        let ticksToLive = 2000;
        let decorationString = spawnString(ActiveScena, text, position, ticksToLive);
    
        decorationString.Color = color;
        decorationString.Height = 18;
        decorationString.DrawLayer = DrawLayer.Birds;
        // @ts-ignore
        decorationString.Font = FontUtils.DefaultVectorFont;
    }

    static DrawLineOnScena(from: MaraPoint, to: MaraPoint, lineColor?: HordeColor): void {
        const thickness = 2.0;
        
        // Caaaanvas wings of death.
        // Prepare to meet your fate.
        let geometryCanvas = new GeometryCanvas();

        let fromPosition = GeometryPresets.CellToCenterPosition(createPoint(from.X, from.Y));
        let toPosition = GeometryPresets.CellToCenterPosition(createPoint(to.X, to.Y));
        
        let color: Stride_Color;

        if (!lineColor) {
            color = new Stride_Color(0xff, 0x00, 0x00);
        }
        else {
            color = new Stride_Color(lineColor.R, lineColor.G, lineColor.B);
        }
        
        geometryCanvas.DrawLine(new Stride_Vector2(fromPosition.X, fromPosition.Y), new Stride_Vector2(toPosition.X, toPosition.Y), color, thickness, false);

        let geometryBuffer = geometryCanvas.GetBuffers();

        let ticksToLive = 2000;
        spawnGeometry(ActiveScena, geometryBuffer, createPoint(0, 0), ticksToLive);
    }

    static DrawPath(path: Array<MaraPoint>, color: HordeColor): void {
        for (let i = 0; i < path.length - 1; i ++) {
            MaraUtils.DrawLineOnScena(path[i], path[i + 1], color);
        }
    }
    //#endregion
}