import { MaraPoint } from "../MaraPoint";


export class EconomySnapshotItem {
    ConfigId: string;
    Position: MaraPoint | undefined;

    constructor(configId: string, position?: MaraPoint) {
        this.ConfigId = configId;
        this.Position = position;
    }
}
