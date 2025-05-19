import { MaraPoint } from "../MaraPoint";
import { MaraRegionCellType } from "./MaraRegionCellType";

export class MaraRegionCellData {
    Type: MaraRegionCellType;
    Cells: Array<MaraPoint>;

    constructor(type: MaraRegionCellType, cells: Array<MaraPoint>) {
        this.Type = type;
        this.Cells = cells;
    }
}


