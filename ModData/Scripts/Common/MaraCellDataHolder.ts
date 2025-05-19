import { IMaraPoint } from "./IMaraPoint";


export abstract class MaraCellDataHolder {
    protected data: any;

    constructor() {
        this.Clear();
    }

    abstract Get(cell: IMaraPoint): any;
    abstract Set(cell: IMaraPoint, value: any): void;

    Clear(): void {
        this.data = {};
    }

    protected makeIndex(cell: IMaraPoint): string {
        return `(${cell.X},${cell.Y})`;
    }
}
