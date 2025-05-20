import { activePlugins } from "active-plugins";
import HordePluginBase from "plugins/base-plugin";
import { Mara } from "./Mara";
import { createResourcesAmount } from "library/common/primitives";
import { isReplayMode } from "library/game-logic/game-tools";
import { LogLevel } from "library/common/logging";

const DISPLAY_NAME = "Mara";

export function onInitialization() {
    activePlugins.register(new MaraPlugin());
}

export class MaraPlugin extends HordePluginBase {
    public constructor() {
        super(DISPLAY_NAME);
    }

    public onFirstRun() {
        this.log.logLevel = LogLevel.Debug;
        
        if (!isReplayMode()) {
            Mara.FirstRun(this.log);
        }
    }

    public onEveryTick(gameTickNum: number) {
        this.mineResources(gameTickNum);
        
        if (!isReplayMode()) {
            Mara.Tick(gameTickNum);
        }
    }

    private mineResources(gameTickNum: number): void {
        const RESOUCE_INCREASE_INTERVAL = 20 * 50; // 10 seconds for standard speed

        if (gameTickNum % RESOUCE_INCREASE_INTERVAL > 0) {
            return;
        }

        let resourceIncrease = createResourcesAmount(10, 10, 10, 1);
        
        for (let player of Players) {
            let realPlayer = player.GetRealPlayer();

            if (realPlayer.IsBot) {
                let settlement = realPlayer.GetRealSettlement();
                
                if (settlement) {
                    let settlementResources = settlement.Resources;
                    settlementResources.AddResources(resourceIncrease);
                }
            }
        }

        Mara.Debug("Mined resources for all Mara controllers: " + resourceIncrease.ToString());
    }
}
