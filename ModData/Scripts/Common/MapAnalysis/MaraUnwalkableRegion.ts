import { MaraPoint } from "../MaraPoint";
import { MaraRegion } from "./MaraRegion";
import { MaraRegionCellData } from "./MaraRegionCellData";
import { MaraRegionCellType } from "./MaraRegionCellType";

export class MaraUnwalkableRegion extends MaraRegion {
    public get OuterCornerCells(): Array<MaraPoint> {
        return this.getCells(MaraRegionCellType.OuterCorner);
    }

    public get InnerCornerCells(): Array<MaraPoint> {
        return this.getCells(MaraRegionCellType.InnerCorner);
    }

    public get SideCells(): Array<MaraPoint> {
        return this.getCells(MaraRegionCellType.Side);
    }

    public get InnerCells(): Array<MaraPoint> {
        return this.getCells(MaraRegionCellType.Inner);
    }

    private cellData: Array<MaraRegionCellData> = [];

    constructor(
        outerCornerCells: Array<MaraPoint>,
        innerCornerCells: Array<MaraPoint>,
        sideCells: Array<MaraPoint>,
        innerCells: Array<MaraPoint>
    ) {
        super([...outerCornerCells, ...innerCornerCells, ...sideCells, ...innerCells]);

        this.cellData.push(new MaraRegionCellData(MaraRegionCellType.OuterCorner, outerCornerCells));
        this.cellData.push(new MaraRegionCellData(MaraRegionCellType.InnerCorner, innerCornerCells));
        this.cellData.push(new MaraRegionCellData(MaraRegionCellType.Side, sideCells));
        this.cellData.push(new MaraRegionCellData(MaraRegionCellType.Inner, innerCells));
    }

    private getCells(type: MaraRegionCellType): Array<MaraPoint> {
        let cellData = this.cellData.find((v) => v.Type == type);
        return cellData ? cellData.Cells : [];
    }
}
