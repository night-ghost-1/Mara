import { IMaraPoint } from "../IMaraPoint";
import { MaraCellDataHolder } from "../MaraCellDataHolder";
import { MaraPoint } from "../MaraPoint";

export class MaraCellIndex extends MaraCellDataHolder {
    Get(cell: IMaraPoint): any {
        let index = this.makeIndex(cell);
        return (this.data[index] ?? false);
    }

    Set(cell: IMaraPoint, value: any) {
        let index = this.makeIndex(cell);
        this.data[index] = value;
    }

    Del(cell: IMaraPoint) {
        let index = this.makeIndex(cell);
        delete this.data[index];
    }

    SetMany(cells: Array<MaraPoint>) {
        cells.forEach((v) => this.Set(v, true));
    }
}
