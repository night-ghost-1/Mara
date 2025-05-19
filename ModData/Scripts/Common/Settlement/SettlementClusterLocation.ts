import { MaraPoint } from "../MaraPoint";
import { MaraRect } from "../MaraRect";

export class SettlementClusterLocation {
    Center: MaraPoint;
    BoundingRect: MaraRect;
    HasHealers: boolean;

    constructor(center: MaraPoint, boundingRect: MaraRect, hasHealers = false) {
        this.Center = center;
        this.BoundingRect = boundingRect;
        this.HasHealers = hasHealers;
    }
}
