import { MaraCellDataHolder } from "../MaraCellDataHolder";
import { MaraPoint } from "../MaraPoint";
import { MaraResourceCluster } from "./MaraResourceCluster";
import { MaraUtils } from "../../MaraUtils";
import { Mara } from "../../Mara";
import { MaraCellIndex } from "./MaraCellIndex";
import { ResourceTile, ResourceTileType, Settlement, TileType, Unit, UnitBuildingCompleteEventArgs, UnitConfig } from "library/game-logic/horde-types";
import { MaraUnwalkableRegion } from "./MaraUnwalkableRegion";
import { MaraRegion } from "./MaraRegion";
import { MaraRegionIndex } from "./MaraRegionIndex";
import { MaraMapNode } from "./MaraMapNode";
import { MaraMapNodeType } from "./MaraMapNodeType";
import { createHordeColor, HordeColor } from "library/common/primitives";
import { MaraPath } from "./MaraPath";
import SortedSet from "../SortedSet.js"
import RBush from "../RBush/rbush.js"
import { MaraRect } from "../MaraRect";
import { unitCanBePlacedByRealMap } from "library/game-logic/unit-and-map";
import { MaraMapNodeLink } from "./MaraMapNodeLink";
import { MaraUnitCacheItem } from "../Cache/MaraUnitCacheItem";
import { IMaraPoint } from "../IMaraPoint";
import { MasterMind } from "library/mastermind/mastermind-types";

type UnitsListChangedEventArgs = HordeClassLibrary.World.Settlements.Modules.SettlementUnits.UnitsListChangedEventArgs;
type ChangesObtainer = HordeClassLibrary.World.ScenaComponents.TickChanges.TickChangesObtainer<HordeClassLibrary.World.ScenaComponents.Intrinsics.ResourcesMapModification>;

class TileTypeCache extends MaraCellDataHolder {
    constructor () {
        super();
    }

    Get(cell: IMaraPoint): TileType | null {
        let index = this.makeIndex(cell);
        return this.data[index];
    }

    Set(cell: IMaraPoint, value: TileType | null) {
        let index = this.makeIndex(cell);
        this.data[index] = value;
    }
}

class ClusterData extends MaraCellDataHolder {
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

export class MaraResourceClusterBushItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;

    ResourceCluster: MaraResourceCluster;

    constructor(cluster: MaraResourceCluster) {
        this.minX = cluster.Center.X;
        this.minY = cluster.Center.Y;
        this.maxX = cluster.Center.X;
        this.maxY = cluster.Center.Y;

        this.ResourceCluster = cluster;
    }
}

export class MaraMap {
    public static ResourceClusters: Array<MaraResourceCluster>;
    public static ProcessedResourceCells: Set<string> = new Set<string>();
    
    public static readonly WALKABLE_REGION_SIZE = 10;
    public static readonly UNWALKABLE_REGION_SIZE = 4;
    public static readonly GATE_THRESHOLD = 10;
    public static readonly RESOURCE_CLUSTER_SIZE = 8;
    public static readonly RESOURCE_CLUSTER_MAX_MINERAL_CELLS = 9;
    private static readonly MAX_PATH_COUNT = 10;

    private static readonly WALKABLE_TO_WALKABLE_COST = 1;
    private static readonly WALKABLE_TO_UNWALKABLE_COST = 2;
    private static readonly UNWALKABLE_TO_WALKABLE_COST = 1;
    private static readonly UNWALKABLE_TO_UNWALKABLE_COST = 2;

    private static readonly REACHABLE_CELL_SEARCH_RADIUS = 5;
    
    private static tileTypeCache: TileTypeCache = new TileTypeCache();
    
    private static DEBUG_MAP = false;
    private static mapNodes: Array<MaraMapNode> = [];
    private static nodeIndex: MaraRegionIndex;

    private static DEBUG_RESOURCES = false;
    private static resourceMapMonitor: ChangesObtainer;
    private static resourceData: Array<Array<ResourceTile>> = [];
    private static clusterData: ClusterData = new ClusterData();
    private static clusterSpatialIndex: RBush;

    private static unitBuildHandlers: Map<number, any>;

    private static cellsCache: Map<string, MaraPoint>;
    
    public static Init(): void {
        MaraMap.resourceMapMonitor = MaraUtils.GetScena().ResourcesMap.CreateChangesObtainer("resource monitor");
        MaraMap.unitBuildHandlers = new Map<number, any>();
        MaraMap.cellsCache = new Map<string, MaraPoint>();
        
        Mara.Debug(`Analyzing terrain...`);
        MaraMap.buildMap();

        for (let settlement of MaraUtils.GetAllSettlements()) {
            MaraMap.watchSettlement(settlement);
        }
        
        Mara.Debug(`Building resource map...`);
        MaraMap.initCellResources();
        MaraMap.initResourceClusters();

        Mara.Debug(`Terrain analysis complete.`);

        if (MaraMap.DEBUG_MAP) {
            MaraMap.drawMap();
        }
        
        if (MaraMap.DEBUG_RESOURCES) {
            MaraMap.drawResources();
        }
    }

    public static Tick(): void {
        let changes = MaraMap.resourceMapMonitor.GetNewChanges();

        ForEach(changes, (item) => {
            let cluster = this.clusterData.Get(item.Cell);

            if (cluster) {
                cluster.UpdateWoodAmount();
            }
        });
    }

    static GetCellMineralType(x: number, y: number): ResourceTileType {
        let res = MaraMap.resourceData[x][y];
        return res.ResourceType;
    }

    static GetCellMineralsAmount(x: number, y: number): number {
        let res = MaraMap.resourceData[x][y];
        return res.ResourceAmount;
    }

    static GetCellTreesCount(x: number, y: number): number {
        let res = MaraMap.resourceData[x][y];
        return res.TreesCount;
    }

    static BindCellToCluster(cell: MaraPoint, cluster: MaraResourceCluster) {
        MaraMap.clusterData.Set(cell, cluster);
    }

    static GetShortestPath(from: MaraPoint, to: MaraPoint, unwalkableNodeTypesToInclude: Array<TileType> = []): MaraPath | null {
        let fromNode = MaraMap.mapNodes.find((n) => n.Region.HasCell(from));

        if (!fromNode) {
            return null;
        }

        let toNode = MaraMap.mapNodes.find((n) => n.Region.HasCell(to));

        if (!toNode) {
            return null;
        }

        MaraMap.initPathfinding(unwalkableNodeTypesToInclude);

        //let path = MaraMap.dijkstraPath(fromNode, toNode, MaraMap.mapNodes);
        let path = MaraMap.aStarPath(
            fromNode, 
            toNode, 
            MaraMap.aStarHeuristic,
            MaraMap.mapNodes
        );

        if (path.length == 0) {
            return null;
        }
        else {
            return new MaraPath(path);
        }
    }

    static GetPaths(from: MaraPoint, to: MaraPoint, unwalkableNodeTypesToInclude: Array<TileType> = []): Array<MaraPath> {
        let fromNode = MaraMap.mapNodes.find((n) => n.Region.HasCell(from));

        if (!fromNode) {
            return [];
        }

        let toNode = MaraMap.mapNodes.find((n) => n.Region.HasCell(to));

        if (!toNode) {
            return [];
        }

        MaraMap.initPathfinding(unwalkableNodeTypesToInclude);
        
        let paths: Array<MaraPath> = [];
        const WEIGTH_INCREMENT = 100;

        while (paths.length < MaraMap.MAX_PATH_COUNT) {
            //let path = MaraMap.dijkstraPath(fromNode, toNode, MaraMap.mapNodes);
            let path = MaraMap.aStarPath(fromNode, toNode, MaraMap.aStarHeuristic, MaraMap.mapNodes);
            
            if (path.length == 0) { // not found
                return [];
            }
        
            if (path.every((v) => v.Weigth > WEIGTH_INCREMENT)) {
                break;
            }
            else {
                path.forEach((v) => v.Weigth += WEIGTH_INCREMENT);
                paths.push(new MaraPath(path));
            }
        }

        return paths;
    }

    static GetTileType(cell: MaraPoint): TileType | null {
        let tileType = MaraMap.tileTypeCache.Get(cell);

        if (!tileType) {
            tileType = MaraUtils.GetTileType(cell);
            MaraMap.tileTypeCache.Set(cell, tileType);
        }
        
        return tileType;
    }

    static AddNode(nodeCells: Array<MaraPoint>, nodeType: MaraMapNodeType): void {
        let overlappedNodes: Array<MaraMapNode> = [];

        for (let cell of nodeCells) {
            let node = MaraMap.nodeIndex.Get(cell);

            if (node && !overlappedNodes.find((v) => v == node)) {
                overlappedNodes.push(node);
            }
        }

        for (let node of overlappedNodes) {
            node.Region.DelCells(nodeCells);
        }

        for (let node of overlappedNodes) {
            for (let link of node.Links) {
                link.Node.Links = link.Node.Links.filter((n) => n.Node != node);
            }

            node.Links = [];
        }

        overlappedNodes = overlappedNodes.filter((n) => n.Region.Cells.length > 0);

        let newNode = new MaraMapNode(
            new MaraRegion(nodeCells),
            [],
            nodeType
        );

        MaraMap.mapNodes.push(newNode);
        MaraMap.nodeIndex.SetMany(nodeCells, newNode);
        MaraMap.mapNodes = MaraMap.mapNodes.filter((n) => n.Region.Cells.length > 0);

        MaraMap.linkMap([newNode, ...overlappedNodes], MaraMap.nodeIndex, true);

        if (MaraMap.DEBUG_MAP) {
            MaraMap.drawMap();
        }
    }

    static GetResourceClustersAroundPoint(point: MaraPoint, radius: number): Array<MaraResourceCluster> {
        let rect = MaraRect.CreateFromPoint(new MaraPoint(point.X, point.Y), radius);

        let cacheItems = MaraMap.clusterSpatialIndex.search({
            minX: rect.TopLeft.X,
            minY: rect.TopLeft.Y,
            maxX: rect.BottomRight.X,
            maxY: rect.BottomRight.Y
        }) as Array<MaraResourceClusterBushItem>;

        return cacheItems.map((i) => i.ResourceCluster);
    }

    static GetMapNode(cell: MaraPoint): MaraMapNode | undefined {
        return MaraMap.mapNodes.find((n) => n.Region.HasCell(cell));
    }

    static GetAllNodes(nodeType: MaraMapNodeType): Array<MaraMapNode> {
        return this.mapNodes.filter((n) => n.Type == nodeType);
    }

    static ConnectMapNodesByBridge(nodesPath: Array<MaraMapNode>, bridgeConfigId: string, masterMind: MasterMind): Array<MaraRect> {
        if (nodesPath.length < 3) {
            return [];
        }
        
        let sourceNode = nodesPath[0];
        let firstUnwalkableNode = nodesPath[1];
        let sourceCells = MaraMap.getNeighbourCells(firstUnwalkableNode, sourceNode);

        let destNode = nodesPath[nodesPath.length - 1];
        let lastUnwalkableNode = nodesPath[nodesPath.length - 2];
        let destCells = MaraMap.getNeighbourCells(lastUnwalkableNode, destNode);

        const RETRY_COUNT = 3;

        for (let i = 0; i < RETRY_COUNT; i ++) {
            let sourceCell = MaraUtils.RandomSelect(masterMind, sourceCells);

            if (!sourceCell) {
                return [];
            }

            let destCellsData = destCells.map(
                (v) => {
                    return {
                        Distance: MaraUtils.EuclidDistance(sourceCell, v),
                        Cell: v
                    }
                }
            );

            let closestCellData = MaraUtils.FindExtremum(destCellsData, (candidate, extremum) => extremum.Distance - candidate.Distance);

            if (!closestCellData) {
                return [];
            }

            let destCell = closestCellData.Cell;

            let bridgeSections = MaraMap.markupBridge(sourceCell, destCell, bridgeConfigId);

            if (MaraMap.validateBridge(bridgeSections, sourceNode, destNode)) {
                return bridgeSections;
            }
        }
        
        return [];
    }

    static UpdatePathForUnit(unit: MaraUnitCacheItem, path: Array<MaraPoint>): Array<MaraPoint> {
        let updatedPath = new Array<MaraPoint>();

        let unitMovementType = MaraUtils.GetConfigIdMoveType(unit.UnitCfgId);

        for (let cell of path) {
            let cellKey = unitMovementType + cell.ToString();
            
            let reachableCell = MaraMap.cellsCache.get(cellKey);
            
            if (!reachableCell) {
                let closestCell = MaraUtils.FindClosestCell(
                    cell, 
                    MaraMap.REACHABLE_CELL_SEARCH_RADIUS,
                    (cell) => MaraUtils.IsCellReachable(cell, unit)
                );

                if (closestCell) {
                    MaraMap.cellsCache.set(cellKey, closestCell);
                    reachableCell = closestCell;
                }
                else {
                    reachableCell = cell;
                }
            }

            updatedPath.push(reachableCell);
        }
        
        return updatedPath;
    }

    static IsWalkableCell(cell: MaraPoint): boolean {
        let scena = MaraUtils.GetScena();
        
        if (
            cell.X < 0 || cell.Y < 0 ||
            cell.X >= scena.Size.Width || cell.Y >= scena.Size.Height
        ) {
            return false;
        }
        
        let tileType = MaraMap.GetTileType(cell);
        return !(tileType == TileType.Water || tileType == TileType.Mounts);
    }

    private static initPathfinding(unwalkableNodeTypesToInclude: Array<TileType>): void {
        const UNWALKABLE_NODE_INITIAL_WEIGTH = 1;
        
        MaraMap.mapNodes.forEach((n) => {
            if (n.Type != MaraMapNodeType.Unwalkable) {
                n.Weigth = 1;
            }
            else if (
                unwalkableNodeTypesToInclude.findIndex((v) => v == n.TileType) > -1
            ) {
                n.Weigth = UNWALKABLE_NODE_INITIAL_WEIGTH;
            }
            else {
                n.Weigth = Infinity;
            }
        });
    }    

    private static validateBridge(bridgeSections: Array<MaraRect>, sourceNode: MaraMapNode, destNode: MaraMapNode): boolean {
        if (bridgeSections.length == 0) {
            return false;
        }

        return (
            MaraMap.isBridgeSectionNeighboursNode(bridgeSections[0], sourceNode) &&
            MaraMap.isBridgeSectionNeighboursNode(bridgeSections[bridgeSections.length - 1], destNode)
        )
    }

    private static isBridgeSectionNeighboursNode(section: MaraRect, node: MaraMapNode): boolean {
        for (let x = section.TopLeft.X - 1; x <= section.BottomRight.X + 1; x ++) {
            for (let y = section.TopLeft.Y - 1; y <= section.BottomRight.Y + 1; y ++) {
                let cell = new MaraPoint(x, y);
                
                if (node.Region.HasCell(cell)) {
                    return true;
                }
            }
        }

        return false;
    }

    private static getNeighbourCells(node1: MaraMapNode, node2: MaraMapNode): Array<MaraPoint> {
        let result: Array<MaraPoint> = [];

        MaraMap.processAllNeighbours(
            node1,
            MaraMap.nodeIndex,
            true,
            (neighbourCell, neighbourNode) => {
                if (
                    node2.Region.HasCell(neighbourCell) &&
                    !result.find((v) => v == neighbourCell)
                ) {
                    result.push(neighbourCell);
                }
            }
        );

        return result
    }

    private static markupBridge(from: MaraPoint, to: MaraPoint, bridgeConfigId: string): Array<MaraRect> {
        let coveredCells = new MaraCellIndex();
        let cellsToCover = MaraUtils.MakeLine(from, to);
        let bridgeConfig = MaraUtils.GetUnitConfig(bridgeConfigId);
    
        if (!cellsToCover[0].EqualsTo(from)) {
            cellsToCover.reverse();
        }
    
        let bridgeWidth = MaraUtils.GetConfigIdWidth(bridgeConfigId);
        let bridgeHeigth = MaraUtils.GetConfigIdHeight(bridgeConfigId);
        let offset = new MaraPoint(0, 0);
        let result = new Array<MaraRect>();
    
        for (let i = 0; i < cellsToCover.length; i ++) {
            let currentCell = cellsToCover[i];
            
            if (coveredCells.Get(currentCell)) {
                continue;
            }
    
            let bridgeSectionPosition = currentCell.Shift(offset);
    
            if (
                !MaraMap.isBridgeCanBePlaced(
                    bridgeConfig, 
                    bridgeWidth, 
                    bridgeHeigth,
                    bridgeSectionPosition, 
                    coveredCells
                )
            ) {
                let newOffset = MaraMap.recalcBridgeSectionOffset(
                    bridgeConfig, 
                    bridgeWidth, 
                    bridgeHeigth, 
                    currentCell, 
                    coveredCells
                );
    
                if (newOffset) {
                    offset = newOffset;
                    bridgeSectionPosition = currentCell.Shift(offset);
                }
                else {
                    if (result.length == 0) {
                        continue;
                    }
                    else {
                        return result;
                    }
                }
            }
    
            let bridgeBottomRight = new MaraPoint(
                bridgeSectionPosition.X + bridgeWidth - 1,
                bridgeSectionPosition.Y + bridgeHeigth - 1
            );
    
            let newSection = new MaraRect(
                bridgeSectionPosition,
                bridgeBottomRight
            );
    
            result.push(newSection);
    
            for (let x = bridgeSectionPosition.X; x <= bridgeBottomRight.X; x ++) {
                for (let y = bridgeSectionPosition.Y; y <= bridgeBottomRight.Y; y ++) {
                    coveredCells.Set(new MaraPoint(x, y), true);
                }
            }
        }
        
        return result;
    }

    private static isBridgeCanBePlaced(
        bridgeConfig: UnitConfig, 
        bridgeWidth: number, 
        bridgeHeigth: number, 
        position: MaraPoint, 
        coveredCells: MaraCellIndex
    ): boolean {
        if (!unitCanBePlacedByRealMap(bridgeConfig, position.X, position.Y)) {
            return false;
        }
        
        let bridgeBottomRight = new MaraPoint(
            position.X + bridgeWidth - 1,
            position.Y + bridgeHeigth - 1
        );
    
        let sectionRect = new MaraRect(
            position,
            bridgeBottomRight
        );
    
        for (let x = sectionRect.TopLeft.X; x <= sectionRect.BottomRight.X; x ++) {
            for (let y = sectionRect.TopLeft.Y; y <= sectionRect.BottomRight.Y; y ++) {
                if (coveredCells.Get(new MaraPoint(x, y))) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    private static recalcBridgeSectionOffset(
        bridgeConfig: UnitConfig, 
        bridgeWidth: number, 
        bridgeHeigth: number, 
        position: MaraPoint, 
        coveredCells: MaraCellIndex
    ): MaraPoint | null {
        for (let row = Math.max(position.Y - bridgeHeigth + 1, 0); row <= position.Y; row ++) {
            for (let col = Math.max(position.X - bridgeWidth + 1, 0); col <= position.X; col ++) {
                let newPosition = new MaraPoint(col, row);
                
                if (MaraMap.isBridgeCanBePlaced(bridgeConfig, bridgeWidth, bridgeHeigth, newPosition, coveredCells)) {
                    return new MaraPoint(col - position.X, row - position.Y);
                }
            }
        }
    
        return null;
    }

    private static buildMap(): void {
        let grid = MaraMap.makeMapGrid(MaraMap.UNWALKABLE_REGION_SIZE);

        let unwalkableRegions = MaraMap.detectUnwalkableRegions(grid);
        
        let unwalkableRegionCellsIndex = new MaraCellIndex();
        let regionIndex = new MaraRegionIndex();

        for (let region of unwalkableRegions) {
            regionIndex.SetMany(region.Cells, region);
            unwalkableRegionCellsIndex.SetMany(region.Cells)
            MaraMap.mapNodes.push(new MaraMapNode(region, [], MaraMapNodeType.Unwalkable));
        }

        let gateEnds = MaraMap.detectGateEnds(unwalkableRegions);
        let gateData = MaraMap.makeGates(gateEnds, unwalkableRegions);

        let gates = gateData[0];
        let gateCellsIndex = gateData[1];
        
        for (let gate of gates) {
            regionIndex.SetMany(gate.Cells, gate);
            MaraMap.mapNodes.push(new MaraMapNode(gate, [], MaraMapNodeType.Gate));
        }

        grid = MaraMap.makeMapGrid(MaraMap.WALKABLE_REGION_SIZE);

        let walkableRegions = MaraMap.makeWalkableRegions(grid, unwalkableRegionCellsIndex, gateCellsIndex);

        for (let region of walkableRegions) {
            regionIndex.SetMany(region.Cells, region);
            MaraMap.mapNodes.push(new MaraMapNode(region, [], MaraMapNodeType.Walkable));
        }

        MaraMap.nodeIndex = new MaraRegionIndex();

        for (let node of MaraMap.mapNodes) {
            MaraMap.nodeIndex.SetMany(node.Region.Cells, node);
        }

        MaraMap.linkMap(MaraMap.mapNodes, MaraMap.nodeIndex, false);
        
        MaraMap.cleanupMapNodes();
        MaraMap.nodeIndex.Clear();
        
        for (let node of MaraMap.mapNodes) {
            MaraMap.nodeIndex.SetMany(node.Region.Cells, node);
        }
    }

    private static makeMapGrid(regionSize: number): Array<Array<MaraPoint>> {
        let grid: Array<Array<MaraPoint>> = [];
        let scena = MaraUtils.GetScena();

        for (let macroRow = 0; macroRow < scena.Size.Height; macroRow += regionSize) {
            for (let macroCol = 0; macroCol < scena.Size.Width; macroCol += regionSize) {
                let searchArea: Array<MaraPoint> = [];
                
                for (
                    let x = macroCol; 
                    x < Math.min(macroCol + regionSize, scena.Size.Width);
                    x ++
                ) {
                    for (
                        let y = macroRow; 
                        y < Math.min(macroRow + regionSize, scena.Size.Height);
                        y ++
                    ) {
                        searchArea.push(new MaraPoint(x, y));
                    }
                }

                if (searchArea.length > 0) {
                    grid.push(searchArea);
                }
            }
        }

        return grid;
    }

    private static detectUnwalkableRegions(grid: Array<Array<MaraPoint>>): Array<MaraUnwalkableRegion> {
        let unwalkableRegionCells: MaraPoint[][] = [];

        for (let area of grid) {
            MaraUtils.WaveOverCells(
                area, 
                (cell: MaraPoint, neighbour: MaraPoint) => {
                    return !MaraMap.IsWalkableCell(cell) && MaraMap.GetTileType(cell) == MaraMap.GetTileType(neighbour);
                },
                (cells) => {},
                (cells) => {
                    if (cells.length > 0) {
                        unwalkableRegionCells.push(cells);
                    }
                }
            );
        }

        let unwalkableRegions: Array<MaraUnwalkableRegion> = [];

        for (let cells of unwalkableRegionCells) {
            let region = MaraMap.makeUnwalkableRegion(cells)
            unwalkableRegions.push(region);
        }

        return unwalkableRegions;
    }

    private static makeUnwalkableRegion(regionCells: Array<MaraPoint>): MaraUnwalkableRegion {
        let cellIndex: Set<string> = new Set<string>(regionCells.map((cell) => cell.ToString()));
            
        let outerCornerCells: Array<MaraPoint> = [];
        let innerCornerCells: Array<MaraPoint> = [];
        let sideCells: Array<MaraPoint> = [];
        let innerCells: Array<MaraPoint> = [];
        
        for (let cell of regionCells) {
            let outerCornerConditions: Array<[MaraPoint, boolean]> = [
                [new MaraPoint(0, -1), true],
                [new MaraPoint(-1, -1), true],
                [new MaraPoint(-1, 0), true]
            ];

            for (let i = 0; i < 4; i ++) {
                for (let j = 0; j < outerCornerConditions.length; j ++) {
                    outerCornerConditions[j][0] = outerCornerConditions[j][0].Rotate90DegreesCcw();
                }

                if (MaraMap.isWalkabilityConditionsSatisfied(cell, outerCornerConditions)) {
                    outerCornerCells.push(cell);
                    break;
                }
            }
        }

        for (let cell of regionCells) {
            if (
                outerCornerCells.find((value) => value.EqualsTo(cell))
            ) {
                continue;
            }
            
            let innerCornerConditions: Array<[MaraPoint, boolean]> = [
                [new MaraPoint(0, -1), false],
                [new MaraPoint(-1, -1), true],
                [new MaraPoint(-1, 0), false]
            ];

            for (let i = 0; i < 4; i ++) {
                for (let j = 0; j < innerCornerConditions.length; j ++) {
                    innerCornerConditions[j][0] = innerCornerConditions[j][0].Rotate90DegreesCcw();
                }

                if (MaraMap.isWalkabilityConditionsSatisfied(cell, innerCornerConditions)) {
                    innerCornerCells.push(cell);
                    break;
                }
            }
        }

        for (let cornerCell of [...outerCornerCells, ...innerCornerCells]) {
            let directionVector = new MaraPoint(1, 0);
            let neighboursVectors: Array<MaraPoint> = [
                new MaraPoint(0, 1),
                new MaraPoint(0, -1),
            ];

            for (let i = 0; i < 4; i ++) {
                directionVector = directionVector.Rotate90DegreesCcw();
                
                for (let j = 0; j < neighboursVectors.length; j ++) {
                    neighboursVectors[j] = neighboursVectors[j].Rotate90DegreesCcw();
                }

                let shiftVector = directionVector.Copy();

                while (true) {
                    let sideCellCandidate = cornerCell.Shift(shiftVector);

                    if (
                        !cellIndex.has(sideCellCandidate.ToString()) ||
                        outerCornerCells.find((value) => value.EqualsTo(sideCellCandidate)) ||
                        innerCornerCells.find((value) => value.EqualsTo(sideCellCandidate)) ||
                        sideCells.find((value) => value.EqualsTo(sideCellCandidate))
                    ) {
                        break;
                    }

                    if (MaraMap.isAnyNeighboursWalkable(sideCellCandidate, neighboursVectors)) {
                        sideCells.push(sideCellCandidate);
                    }

                    shiftVector = shiftVector.Shift(directionVector);
                }
            }
        }

        for (let cell of regionCells) {
            if (
                !outerCornerCells.find((value) => value.EqualsTo(cell)) &&
                !innerCornerCells.find((value) => value.EqualsTo(cell)) &&
                !sideCells.find((value) => value.EqualsTo(cell))
            ) {
                innerCells.push(cell);
            }
        }

        return new MaraUnwalkableRegion(outerCornerCells, innerCornerCells, sideCells, innerCells);
    }

    private static detectGateEnds(unwalkableRegions: Array<MaraUnwalkableRegion>): Array<[MaraPoint, MaraPoint]> {
        let cellPairs: [MaraPoint, MaraPoint][] = [];

        for (let region of unwalkableRegions) {
            for (let otherRegion of unwalkableRegions) {
                if (otherRegion == region) {
                    continue;
                }

                if (MaraUtils.ChebyshevDistance(region.Center, otherRegion.Center) > 2 * MaraMap.WALKABLE_REGION_SIZE) {
                    continue;
                }

                let closestDistance = Infinity;
                let closestChebyshevDistance = Infinity;
                let sourceCell: MaraPoint | null = null;
                let closestCell: MaraPoint | null = null;

                for (let cell of region.OuterCornerCells) {
                    let otherRegionCells = [...otherRegion.OuterCornerCells, ...otherRegion.SideCells];
                    otherRegionCells = otherRegionCells.filter((value) => MaraUtils.ChebyshevDistance(cell, value) <= MaraMap.GATE_THRESHOLD);
                    
                    for (let otherCell of otherRegionCells) {
                        if (cell.EqualsTo(otherCell)) {
                            continue;
                        }

                        let distance = MaraUtils.EuclidDistance(cell, otherCell);

                        if (distance < closestDistance) {
                            closestDistance = distance;
                            closestChebyshevDistance = MaraUtils.ChebyshevDistance(cell, otherCell);
                            sourceCell = cell;
                            closestCell = otherCell;
                        }
                    }
                }

                if (sourceCell && closestChebyshevDistance <= MaraMap.GATE_THRESHOLD) {
                    let closestBackCellIndex = cellPairs.findIndex((value) => value[0] == closestCell);

                    if (closestBackCellIndex < 0) {
                        cellPairs.push([closestCell!, sourceCell]);
                    }
                    else {
                        let pairCell = cellPairs[closestBackCellIndex][1];
                        
                        if (closestDistance < MaraUtils.EuclidDistance(pairCell, closestCell!)) {
                            cellPairs[closestBackCellIndex][1] = sourceCell;
                        }
                    }
                }
            }

            if (region.OuterCornerCells.length > 0) {
                let leftmostCell: MaraPoint = MaraUtils.FindExtremum(region.OuterCornerCells, (a, b) => b.X - a.X)!;
                let rightmostCell: MaraPoint = MaraUtils.FindExtremum(region.OuterCornerCells, (a, b) => a.X - b.X)!;
                let topCell: MaraPoint = MaraUtils.FindExtremum(region.OuterCornerCells, (a, b) => b.Y - a.Y)!;
                let bottomCell: MaraPoint = MaraUtils.FindExtremum(region.OuterCornerCells, (a, b) => a.Y - b.Y)!;

                if (leftmostCell.X > 0 && leftmostCell.X <= MaraMap.GATE_THRESHOLD) {
                    cellPairs.push([new MaraPoint(0, leftmostCell.Y), leftmostCell]);
                }

                let scena = MaraUtils.GetScena();

                if (
                    rightmostCell.X != scena.Size.Width - 1 && 
                    scena.Size.Width - 1 - rightmostCell.X <= MaraMap.GATE_THRESHOLD
                ) {
                    cellPairs.push([new MaraPoint(scena.Size.Width - 1, rightmostCell.Y), rightmostCell]);
                }

                if (topCell.Y > 0 && topCell.Y <= MaraMap.GATE_THRESHOLD) {
                    cellPairs.push([new MaraPoint(topCell.X, 0), topCell]);
                }

                if (
                    bottomCell.Y != scena.Size.Height - 1 &&
                    scena.Size.Height - 1 - bottomCell.Y <= MaraMap.GATE_THRESHOLD
                ) {
                    cellPairs.push([new MaraPoint(bottomCell.X, scena.Size.Height - 1), bottomCell]);
                }
            }
        }

        return cellPairs;
    }

    private static makeGates(
        cellPairs: Array<[MaraPoint, MaraPoint]>, 
        unwalkableRegions: Array<MaraUnwalkableRegion>
    ): [Array<MaraRegion>, MaraCellIndex] {
        let gates: Array<MaraRegion> = [];
        let gateCellsIndex: MaraCellIndex = new MaraCellIndex();
        
        for (let pair of cellPairs) {
            let gateCells: MaraPoint[] = [];

            let line = MaraUtils.MakeLine(pair[0], pair[1]);

            for (let region of unwalkableRegions) {
                if (
                    region.Cells.find((v) => v.EqualsTo(pair[0]))
                ) {
                    line = line.filter((v) => !v.EqualsTo(pair[0]));
                }
                else if (
                    region.Cells.find((v) => v.EqualsTo(pair[1]))
                ) {
                    line = line.filter((v) => !v.EqualsTo(pair[1]));
                }
            }
            
            for (let cell of line) {
                if (gateCellsIndex.Get(cell)) {
                    gateCells = [];
                    break;
                }
                else if (
                    unwalkableRegions.find((r) => {
                        return r.Cells.find((v) => v.EqualsTo(cell))
                    })
                ) {
                    gateCells = [];
                    break;
                }
                else {
                    gateCells.push(cell);
                }
            }

            if (gateCells.length > 0) {
                let gate = new MaraRegion(gateCells);
                gates.push(gate);
                gateCellsIndex.SetMany(gateCells);
            }
        }

        return [gates, gateCellsIndex];
    }

    private static makeWalkableRegions(
        grid: Array<Array<MaraPoint>>,
        unwalkableCellsIndex: MaraCellIndex,
        gateCellsIndex: MaraCellIndex
    ): Array<MaraRegion> {
        let regions: Array<MaraRegion> = [];

        for (let area of grid) {
            MaraUtils.WaveOverCells(
                area,
                (cell, neighbour) => {
                    if (unwalkableCellsIndex.Get(neighbour) || gateCellsIndex.Get(neighbour)) {
                        return false;
                    }
                    else {
                        return true;
                    }
                },
                (c) => {},
                (cells) => {
                    if (cells.length == 0) {
                        return;
                    }
    
                    let region = new MaraRegion(cells);
                    regions.push(region);
                }
            );
        }

        return regions;
    }

    private static linkMap(mapNodes: Array<MaraMapNode>, nodeIndex: MaraRegionIndex, diagonalLinking: boolean): void {
        for (let node of mapNodes) {
            MaraMap.processAllNeighbours(
                node, 
                nodeIndex,
                diagonalLinking,
                (neighbourCell, neighbourNode) => {
                    MaraMap.linkNodes(node, neighbourNode);
                }
            )
        }
    }

    private static processAllNeighbours(
        mapNode: MaraMapNode, 
        nodeIndex: MaraRegionIndex, 
        includeDiagonals: boolean,
        neighbourProcessor: (neighbourCell: MaraPoint, neighbourNode: MaraMapNode) => void
    ): void {
        for (let cell of mapNode.Region.Cells) {
            let shiftVectors = [
                new MaraPoint(0, 1)
            ];

            if (includeDiagonals) {
                shiftVectors.push(new MaraPoint(1, 1))
            }

            for (let i = 0; i < 4; i ++) {
                for (let i = 0; i < shiftVectors.length; i ++) {
                    shiftVectors[i] = shiftVectors[i].Rotate90DegreesCcw();

                    let vector = shiftVectors[i];
                    let neighbourCell = cell.Shift(vector);
                    let neighbourNode = nodeIndex.Get(neighbourCell);

                    if (neighbourNode && neighbourNode != mapNode) {
                        neighbourProcessor(neighbourCell, neighbourNode);
                    }
                }
            }
        }
    }

    private static cleanupMapNodes(): void {
        let atLeastOneNodeChanged = false;

        do {
            let newNodes: Array<MaraMapNode> = [];
            atLeastOneNodeChanged = false;

            for (let i = 0; i < MaraMap.mapNodes.length; i ++) {
                let node = MaraMap.mapNodes[i];

                if (
                    node.Links.length == 1 &&
                    (
                        node.Type == MaraMapNodeType.Gate ||
                        node.Type == MaraMapNodeType.Walkable && node.Region.Cells.length < MaraMap.WALKABLE_REGION_SIZE / 4
                    )
                ) {
                    let link = node.Links[0];

                    if (link.Node.Type == MaraMapNodeType.Walkable) {
                        link.Node.Region.AddCells(node.Region.Cells);
                        link.Node.Links = link.Node.Links.filter((v) => v.Node != node);
                        
                        atLeastOneNodeChanged = true;
                    }
                    else {
                        newNodes.push(node);
                    }
                }
                else {
                    newNodes.push(node);
                }
            }

            MaraMap.mapNodes = newNodes;
        }
        while (atLeastOneNodeChanged);
    }

    private static linkNodes(node: MaraMapNode, neighbourNode: MaraMapNode): void {
        if (!node.Links.find((v) => v.Node == neighbourNode)) {
            let link = new MaraMapNodeLink(neighbourNode, MaraMap.getTransitionCost(node, neighbourNode));
            node.Links.push(link);
        }
    
        if (!neighbourNode.Links.find((v) => v.Node == node)) {
            let link = new MaraMapNodeLink(node, MaraMap.getTransitionCost(neighbourNode, node));
            neighbourNode.Links.push(link);
        }
    }

    private static getTransitionCost(from: MaraMapNode, to: MaraMapNode): number {
        if (from.IsWalkable()) {
            if (to.IsWalkable()) {
                return MaraMap.WALKABLE_TO_WALKABLE_COST;
            }
            else {
                return MaraMap.WALKABLE_TO_UNWALKABLE_COST;
            }
        }
        else {
            if (to.IsWalkable()) {
                return MaraMap.UNWALKABLE_TO_WALKABLE_COST;
            }
            else {
                return MaraMap.UNWALKABLE_TO_UNWALKABLE_COST;
            }
        }
    }

    private static isWalkabilityConditionsSatisfied(
        cell: MaraPoint, 
        conditions: Array<[MaraPoint, boolean]>
    ): boolean {
        for (let j = 0; j < conditions.length; j ++) {
            let neighbour = cell.Shift(conditions[j][0]);
            let isWalkable = MaraMap.IsWalkableCell(neighbour);
            
            if (isWalkable != conditions[j][1]) {
                return false;
            }
        }
    
        return true;
    }

    private static isAnyNeighboursWalkable(cell: MaraPoint, shiftVectors: Array<MaraPoint>): boolean {
        for (let j = 0; j < shiftVectors.length; j ++) {
            if (
                MaraMap.IsWalkableCell(
                    cell.Shift(shiftVectors[j])
                )
            ) {
                return true;
            }
        }
    
        return false;
    }

    private static drawMap(): void {
        let nodeIndex = 0;
        let processedPairs: [MaraRegion, MaraRegion][] = [];
        
        for (let node of MaraMap.mapNodes) {
            for (let link of node.Links) {
                if (
                    !processedPairs.find(
                        (r) => (r[0] == link.Node.Region || r[1] == link.Node.Region) &&
                        (r[0] == node.Region || r[1] == node.Region)
                    )
                ) {
                    processedPairs.push([node.Region, link.Node.Region]);
                    MaraUtils.DrawLineOnScena(node.Region.Center, link.Node.Region.Center);
                }
            }

            let color: HordeColor;

            switch (node.Type) {
                case MaraMapNodeType.Gate:
                    color = createHordeColor(255, 0, 0, 255);
                    break;
                case MaraMapNodeType.Unwalkable:
                    color = createHordeColor(255, 255, 0, 0);
                    break;
                default:
                    color = createHordeColor(255, 128, 128, 128);
                    break;
            }

            for (let cell of node.Region.Cells) {
                MaraUtils.TextOnMap(`${nodeIndex}`, cell, color);
            }

            nodeIndex ++;
        }
    }

    private static drawResources(): void {
        let clusterIndex = 0;

        MaraMap.ResourceClusters.forEach((v) => {
            let color = createHordeColor(255, 0, 255, 0);
            
            for (let woodCell of v.WoodCells) {
                MaraUtils.TextOnMap(`${clusterIndex}`, woodCell, color);
            }

            color = createHordeColor(255, 128, 128, 128);

            for (let metalCell of v.MetalCells) {
                MaraUtils.TextOnMap(`${clusterIndex}`, metalCell, color);
            }

            color = createHordeColor(255, 255, 255, 0);

            for (let goldCell of v.GoldCells) {
                MaraUtils.TextOnMap(`${clusterIndex}`, goldCell, color);
            }

            clusterIndex ++;
        });
    }

    private static aStarHeuristic(
        curNode: MaraMapNode, 
        toNode: MaraMapNode
    ): number {
        let distance = MaraUtils.ChebyshevDistance(toNode.Region.Center, curNode.Region.Center);

        return distance / MaraMap.WALKABLE_REGION_SIZE;
    }

    private static aStarPath(
        from: MaraMapNode, 
        to: MaraMapNode, 
        heuristic: (
            curNode: MaraMapNode, 
            toNode: MaraMapNode
        ) => number,
        nodes: Array<MaraMapNode>,
    ): Array<MaraMapNode> {
        let options: any = {};
        options.comparator = (a: MaraMapNode, b: MaraMapNode) => {
            let distance = a.AStarHeuristic - b.AStarHeuristic;

            if (isNaN(distance) || distance == 0) {
                return a.Id - b.Id;
            }
            else  {
                return distance;
            }
        }

        let unprocessedNodes = new SortedSet(options);
        from.ShortestDistance = 0;
        from.AStarHeuristic = heuristic(from, to);
        
        for (let n of nodes) {
            if (n != from) {
                n.ShortestDistance = Infinity;
                n.AStarHeuristic = Infinity;
            }

            unprocessedNodes.insert(n);
        }
        
        let processedNodes: {
            [key: number]: MaraMapNode
        } = {};
        
        while (unprocessedNodes.length > 0) {
            let closestNode: MaraMapNode = unprocessedNodes.beginIterator().value();

            if (closestNode == to) {
                break;
            }
            
            for (let link of closestNode.Links) {
                let n = processedNodes[link.Node.Id];
                
                if (n != null) {
                    continue;
                }
    
                let newDistance = MaraMap.calcDistance(closestNode, link);
    
                if (newDistance < link.Node.ShortestDistance) {
                    unprocessedNodes.remove(link.Node);
                    
                    link.Node.PrevNode = closestNode;
                    link.Node.ShortestDistance = newDistance;
                    link.Node.AStarHeuristic = newDistance + heuristic(link.Node, to);
                    
                    unprocessedNodes.insert(link.Node);
                }
            }
            
            processedNodes[closestNode.Id] = closestNode;
            unprocessedNodes.remove(closestNode);
        }
    
        if (to.ShortestDistance == Infinity) { //path not found
            return [];
        }
    
        let result: Array<MaraMapNode> = [];
        result.push(to);
    
        let currentNode = to;
    
        while (currentNode != from) {
            let nextNode = currentNode.PrevNode!;
            result.push(nextNode);
            currentNode = nextNode;
        }
    
        return result.reverse();
    }

    private static calcDistance(source: MaraMapNode, link: MaraMapNodeLink): number {
        return source.ShortestDistance + 
            link.Node.Weigth + 
            link.Weigth * MaraUtils.ChebyshevDistance(source.Region.Center, link.Node.Region.Center);
    }

    private static initCellResources(): void {
        let scenaWidth = MaraUtils.GetScenaWidth();
        let scenaHeigth = MaraUtils.GetScenaHeigth();
        
        for (let x = 0; x < scenaWidth; x++) {
            let columnData: Array<ResourceTile> = [];
            MaraMap.resourceData.push(columnData);
            
            for (let y = 0; y < scenaHeigth; y++) {
                let resourceData = MaraUtils.GetCellResourceData(x, y);
                columnData.push(resourceData);
            }
        }
    }

    private static initResourceClusters(): void {
        let maxRowIndex = Math.floor(MaraUtils.GetScenaHeigth() / MaraMap.RESOURCE_CLUSTER_SIZE);
        let maxColIndex = Math.floor(MaraUtils.GetScenaWidth() / MaraMap.RESOURCE_CLUSTER_SIZE);

        MaraMap.ResourceClusters = [];
        let clusterSpatialData: Array<MaraResourceClusterBushItem> = [];
        
        for (let rowIndex = 0; rowIndex < maxRowIndex; rowIndex ++) {
            for (let colIndex = 0; colIndex < maxColIndex; colIndex ++) {
                let cluster = new MaraResourceCluster(colIndex, rowIndex);

                if (cluster.WoodAmount > 1120 || cluster.MetalAmount > 0 || cluster.GoldAmount > 0) {
                    MaraMap.ResourceClusters.push(cluster);
                    clusterSpatialData.push(new MaraResourceClusterBushItem(cluster));
                }
            }
        }

        MaraMap.clusterSpatialIndex = new RBush(2);
        MaraMap.clusterSpatialIndex.load(clusterSpatialData);
    }

    private static watchSettlement(settlement: Settlement): void {
        settlement.Units.UnitsListChanged.connect(
            (sender: any, UnitsListChangedEventArgs: UnitsListChangedEventArgs | null) => {
                if (UnitsListChangedEventArgs) {
                    MaraMap.unitListChangedProcessor(sender, UnitsListChangedEventArgs);
                }
            }
        );

        for (let unit of MaraUtils.GetAllSettlementUnits(settlement)) {
            if (MaraUtils.IsWalkableConfigId(unit.UnitCfgId)) {
                MaraMap.processWalkableUnitCompletion(unit.Unit);
            }
        }
    }

    private static unitListChangedProcessor(sender: any, UnitsListChangedEventArgs: UnitsListChangedEventArgs): void {
        let unit = UnitsListChangedEventArgs.Unit;

        if (MaraUtils.IsWalkableConfigId(unit.Cfg.Uid)) {
            if (UnitsListChangedEventArgs.IsAdded) {
                let handler = unit.EventsMind.BuildingComplete.connect(
                    (sender: any, args: UnitBuildingCompleteEventArgs | null) => {
                        if (args) {
                            MaraMap.walkableBuildingBuiltProcessor(sender, args);
                        }
                    }
                );

                MaraMap.unitBuildHandlers.set(unit.Id, handler);
            }
            else {
                let unitId = unit.Id;
                let handler = MaraMap.unitBuildHandlers.get(unitId);

                if (handler) {
                    handler.disconnect();
                    MaraMap.unitBuildHandlers.delete(unitId);
                }

                let unitCells = MaraMap.getUnitCells(unit);
                let walkableCellsCount = 0;

                for (let cell of unitCells) {
                    if (MaraMap.IsWalkableCell(cell)) {
                        walkableCellsCount ++;
                    }
                }

                let nodeType = MaraMapNodeType.Unwalkable;

                if (walkableCellsCount > unitCells.length / 2) {
                    nodeType = MaraMapNodeType.Walkable;
                }

                MaraMap.AddNode(unitCells, nodeType);
            }
        }
    }

    private static walkableBuildingBuiltProcessor(sender: any, args: UnitBuildingCompleteEventArgs): void {
        MaraMap.processWalkableUnitCompletion(args.TriggeredUnit);
    }

    private static processWalkableUnitCompletion(unit: Unit): void {
        let unitCells = this.getUnitCells(unit);
        MaraMap.AddNode(unitCells, MaraMapNodeType.Gate);
    }

    private static getUnitCells(unit: Unit): Array<MaraPoint> {
        let unitCells: Array<MaraPoint> = [];

        let maxX = unit.Cell.X + MaraUtils.GetConfigIdWidth(unit.Cfg.Uid);
        let maxY = unit.Cell.Y + MaraUtils.GetConfigIdHeight(unit.Cfg.Uid);

        for (let x = unit.Cell.X; x < maxX; x ++) {
            for (let y = unit.Cell.Y; y < maxY; y ++) {
                unitCells.push(
                    new MaraPoint(x, y)
                );
            }
        }

        return unitCells;
    }
}