import { MaraMap } from "./MaraMap";
import { MaraUtils, ResourceType } from "../../MaraUtils";
import { MaraPoint } from "../MaraPoint";

export class MaraResourceCluster {
    public readonly Index: MaraPoint;
    public readonly Coordinates: MaraPoint;
    public readonly Size: number = MaraMap.RESOURCE_CLUSTER_SIZE;

    public WoodCells: Array<MaraPoint> = [];
    public MetalCells: Array<MaraPoint> = [];
    public GoldCells: Array<MaraPoint> = [];

    private woodAmount: number = 0;
    private center: MaraPoint;

    constructor(x: number, y: number) {
        this.Index = new MaraPoint(x, y);
        this.Coordinates = new MaraPoint(x * MaraMap.RESOURCE_CLUSTER_SIZE, y * MaraMap.RESOURCE_CLUSTER_SIZE);

        let maxRow = Math.min(this.Coordinates.Y + MaraMap.RESOURCE_CLUSTER_SIZE, MaraUtils.GetScenaHeigth());
        let maxCol = Math.min(this.Coordinates.X + MaraMap.RESOURCE_CLUSTER_SIZE, MaraUtils.GetScenaWidth());

        let nextCells: Array<MaraPoint> = [];
        
        for (let row = this.Coordinates.Y; row < maxRow; row ++) {
            for (let col = this.Coordinates.X; col < maxCol; col ++) {
                let cell = new MaraPoint(col, row);
                nextCells.push(cell);
            }
        }

        let mineralCellsCount = 0;

        while (nextCells.length > 0) {
            let currentCells = [...nextCells];
            nextCells = [];

            for (let cell of currentCells) {
                if (MaraMap.ProcessedResourceCells.has(cell.ToString())) {
                    continue;
                }

                MaraMap.ProcessedResourceCells.add(cell.ToString());
                
                let resourceType = MaraMap.GetCellMineralType(cell.X, cell.Y);
                let isMineralCell = false;
                let isResourceCell = false;

                switch (resourceType) {
                    case ResourceType.Metal:
                        this.MetalCells.push(cell);
                        isMineralCell = true;
                        isResourceCell = true;
                        break;
                    case ResourceType.Gold:
                        this.GoldCells.push(cell);
                        isMineralCell = true;
                        isResourceCell = true;
                        break;
                    default:
                        let treesCount = MaraMap.GetCellTreesCount(cell.X, cell.Y);
                        
                        if (treesCount > 0) {
                            this.WoodCells.push(cell);
                            isResourceCell = true;
                        }
                        
                        break;
                }

                if (isResourceCell) {
                    MaraMap.BindCellToCluster(cell, this);
                }

                if (isMineralCell) {
                    mineralCellsCount ++;

                    if (mineralCellsCount < MaraMap.RESOURCE_CLUSTER_MAX_MINERAL_CELLS) {
                        MaraUtils.ForEachCell(
                            cell, 
                            1, 
                            (nextCell) => {
                                let point = new MaraPoint(nextCell.X, nextCell.Y);
    
                                if (
                                    !MaraMap.ProcessedResourceCells.has(point.ToString())
                                ) {
                                    nextCells.push(point);
                                }
                            }
                        );
                    }
                }
            }
        }

        this.UpdateWoodAmount();

        let geometricalCenter = new MaraPoint(this.Coordinates.X + MaraMap.RESOURCE_CLUSTER_SIZE / 2, this.Coordinates.Y + MaraMap.RESOURCE_CLUSTER_SIZE / 2);
        let realCenter = MaraUtils.FindClosestCell(geometricalCenter, MaraMap.RESOURCE_CLUSTER_SIZE / 2,(c) => MaraMap.IsWalkableCell(c))!;

        this.center = realCenter;
    }

    public get WoodAmount(): number {
        return this.woodAmount;
    }

    public get GoldAmount(): number {
        let amount = 0;
        
        for (let cell of this.GoldCells) {
            amount += MaraMap.GetCellMineralsAmount(cell.X, cell.Y);
        }

        return amount;
    }

    public get MetalAmount(): number {
        let amount = 0;
        
        for (let cell of this.MetalCells) {
            amount += MaraMap.GetCellMineralsAmount(cell.X, cell.Y);
        }

        return amount;
    }

    public get Center(): MaraPoint {
        return this.center;
    }

    public ToString(): string {
        return this.Index.ToString();
    }

    public UpdateWoodAmount() {
        let totalTreesCount = 0;
        
        for (let cell of this.WoodCells) {
            totalTreesCount += MaraMap.GetCellTreesCount(cell.X, cell.Y);
        }

        this.woodAmount = totalTreesCount * 10;
    }
}