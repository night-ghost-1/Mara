import { UnitConfig } from "library/game-logic/horde-types";

export class AllowedCompositionItem {
    UnitConfigId: string;
    MaxCount: number;

    constructor(cfg: UnitConfig, maxCount: number) {
        this.UnitConfigId = cfg.Uid;
        this.MaxCount = maxCount;
    }
}
