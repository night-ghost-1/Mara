import { IMaraPoint } from "../IMaraPoint";
import { MaraCellDataHolder } from "../MaraCellDataHolder";
import { MaraPoint } from "../MaraPoint";

export class MaraRegionIndex extends MaraCellDataHolder {
    Get(cell: IMaraPoint): any {
        let index = this.makeIndex(cell);
        return this.data[index];
    }

    Set(cell: IMaraPoint, value: any) {
        let index = this.makeIndex(cell);
        this.data[index] = value;
    }

    SetMany(cells: Array<MaraPoint>, value: any) {
        cells.forEach((v) => this.Set(v, value));
    }
}