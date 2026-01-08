import { activePlugins } from "active-plugins";
import HordePluginBase from "plugins/base-plugin";
import { Mara, MaraDifficultyName } from "./Mara";
import { createResourcesAmount } from "library/common/primitives";
import { isReplayMode } from "library/game-logic/game-tools";
import { LogLevel } from "library/common/logging";
import { MaraUtils } from "./MaraUtils";
import { Settlement } from "library/game-logic/horde-types";

const DISPLAY_NAME = "Mara";

export function onInitialization() {
    activePlugins.register(new MaraPlugin());
}

export class MaraPlugin extends HordePluginBase {
    private static readonly playerNames = [
        "Рогволод",
        "Воибуд",
        "Судимир",
        "Молчан",
        "Доброжир",
        "Ярополк",
        "Псой",
        "Агапий",
        "Харитон",
        "Доброгнев",
        "Фотий",
        "Феофан",
        "Добромысл",
        "Доброслав",
        "Верещаг"
    ];
    
    private isReproducingMode: boolean = false;

    public constructor() {
        super(DISPLAY_NAME);
    }

    public onFirstRun() {
        this.log.logLevel = LogLevel.Info;
        this.isReproducingMode = Battle.IsBotReproducingMode;

        let playerNames = MaraUtils.ShuffleArray(new Array(...MaraPlugin.playerNames));
        let allPlayers = MaraUtils.GetAllPlayers();
        let playerIndex = 0;

        for (let item of allPlayers) {
            let player = Players[item.index];

            if (player.IsBot) {
                let oldPlayerName = player.Nickname;
                let newPlayerName = `[Мара] ${playerNames[playerIndex]}`;
                player.SetBotNickname(newPlayerName);
                this.log.info(`Mara changed player's name from '${oldPlayerName}' to '${newPlayerName}'`);
                
                playerIndex = (playerIndex + 1) % allPlayers.length;
            }
        }

        if (isReplayMode() && !this.isReproducingMode) {
            Mara.CanRun = false;
        }

        Mara.FirstRun(this.log);

        if (isReplayMode() && this.isReproducingMode) {
            Mara.Info(`** Mara started in reproducing mode **`);
        }
    }

    public onEveryTick(gameTickNum: number) {
        this.mineResources(gameTickNum);

        if (!isReplayMode() || this.isReproducingMode) {
            Mara.Tick(gameTickNum);
        }
    }

    private mineResources(gameTickNum: number): void {
        const RESOUCE_INCREASE_INTERVAL = 20 * 50; // 20 seconds for standard speed
        const RESOUCE_INCREASE_INTERVAL_FOR_BRUTAL = 6 * 60 * 50; // 6 minutes for standard speed

        if (gameTickNum % RESOUCE_INCREASE_INTERVAL == 0) {
            let resourceIncrease = createResourcesAmount(10, 10, 10, 1);
            let processedSettlements = new Array<Settlement>();
        
            for (let player of Players) {
                let realPlayer = player.GetRealPlayer();

                if (realPlayer.IsBot) {
                    let settlement = realPlayer.GetRealSettlement();

                    if (processedSettlements.find((s) => s.Uid == settlement.Uid)) {
                        continue;
                    }
                    else {
                        processedSettlements.push(settlement);
                    }
                    
                    let settlementResources = settlement.Resources;
                    settlementResources.AddResources(resourceIncrease);
                }
            }

            Mara.Debug(`Mined resources for all Mara controllers: ${resourceIncrease}`);
        }

        if (gameTickNum % RESOUCE_INCREASE_INTERVAL_FOR_BRUTAL == 0) {
            let resourceIncrease = createResourcesAmount(2000, 2000, 2000, 20);
            let processedSettlements = new Array<Settlement>();
            
            for (let player of Players) {
                if (player.MasterMind?.Character.Uid == MaraDifficultyName.Brutal) {
                    let settlement = player.GetRealSettlement();

                    if (processedSettlements.find((s) => s.Uid == settlement.Uid)) {
                        continue;
                    }
                    else {
                        processedSettlements.push(settlement);
                    }

                    let settlementResources = settlement.Resources;
                    settlementResources.AddResources(resourceIncrease);

                    Mara.Debug(`Mined resources for brutal '${settlement.TownName}' ('${player.Nickname}'): ${resourceIncrease}`);
                }
            }
        }
    }
}
