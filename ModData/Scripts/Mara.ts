import { log, Logger } from "library/common/logging";
import { MaraSettlementController } from "./MaraSettlementController";
import { MaraUtils } from "./MaraUtils";
import { MaraMap } from "./Common/MapAnalysis/MaraMap";
import { PathFinder } from "library/game-logic/path-find";
import { broadcastMessage } from "library/common/messages";
import { createHordeColor } from "library/common/primitives";
import { MaraUnitCache } from "./Common/Cache/MaraUnitCache";
import { MaraUnitConfigCache } from "./Common/Cache/MaraUnitConfigCache";
import { MaraProfiler } from "./Common/MaraProfiler";
import { Settlement } from "library/game-logic/horde-types";

export enum MaraLogLevel {
    Debug = 0,
    Info = 1,
    Warning = 2,
    Error = 3
}

class MaraProfilersCollection {
    [key: string]: MaraProfiler;
}

/*
    Class organizes work of each settlement controller since we can have multiple 
    of them in one game. Also provides some helper functions.

    The class itself is static by its nature
*/

export class Mara {
    private static profilers: MaraProfilersCollection = {};
    
    static CanRun = true;
    static Logger: Logger;

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
    
    private static controllers: Array<MaraSettlementController> = [];
    private static pathfinder: PathFinder;
    
    public static get Controllers(): Array<MaraSettlementController> {
        return Mara.controllers;
    }

    public static get Pathfinder(): PathFinder {
        if (!Mara.pathfinder) {
            Mara.pathfinder = new PathFinder(MaraUtils.GetScena());
        }

        return Mara.pathfinder;
    }

    static Profiler(name: string): MaraProfiler {
        if (Mara.profilers[name] == null) {
            Mara.profilers[name] = new MaraProfiler(name, false);
        }

        return Mara.profilers[name];
    }
    
    static Tick(tickNumber: number): void {
        try {
            if (Mara.CanRun) {
                if (tickNumber < 10) { //doing nothing for first 10 ticks since not all core objects could be properly inited
                    return;
                }

                MaraMap.Tick();
                
                for (let controller of Mara.controllers) {
                    if (!controller.Settlement.Existence.IsTotalDefeat) {
                        controller.Tick(tickNumber - controller.TickOffset);
                    }
                    else {
                        Mara.Log(MaraLogLevel.Info, `Controller '${controller.Player.Nickname}' lost the battle, but not the war!`);
                    }
                }

                Mara.controllers = Mara.controllers.filter((controller) => {return !controller.Settlement.Existence.IsTotalDefeat});

                // if (Mara.Profiler("MaraTick").ExecutionTime >= 20) {
                //     Mara.Debug(`============ LONG TICK PROFILING DATA ============`);

                //     for (let profiler in Mara.profilers) {
                //         Mara.Profiler(profiler).Print();
                //     }
                // }

                Mara.profilers = {};
            }
        }
        catch (ex) {
            log.exception(ex);
            broadcastMessage(`(Мара) Обнаружена ошибка. Мара остановлена.`, createHordeColor(255, 255, 0, 0));
            Mara.CanRun = false;
        }
    };

    static FirstRun(logger: Logger): void {
        Mara.Logger = logger;
        
        Mara.Info(`Engaging Mara...`);
        Mara.Info(`Failed to load library './Empathy/heart', reason: not found. Proceeding without it.`);
        Mara.Info(`Failed to load library './Empathy/soul', reason: not found. Proceeding without it.`);
        Mara.Info(`Empathy subsystem is not responding`);

        try {
            Mara.CanRun = true;
            Mara.controllers = [];

            MaraUnitCache.Init();
            MaraUnitConfigCache.Init();
            MaraMap.Init();

            let tickOffset = 0;
            let processedSettlements: Array<Settlement> = [];
            let playerIndex = 0;
            let playerNames = MaraUtils.ShuffleArray(new Array(...Mara.playerNames));
            let allPlayers = MaraUtils.GetAllPlayers();

            for (let item of allPlayers) {
                let player = Players[item.index];

                if (player.IsBot) {
                    Mara.AttachToPlayer(item.index, processedSettlements, tickOffset);
                    
                    let oldPlayerName = player.Nickname;
                    let newPlayerName = playerNames[playerIndex];
                    player.SetBotNickname(newPlayerName);
                    Mara.Info(`Changed player's name from '${oldPlayerName}' to '${newPlayerName}'`);

                    tickOffset ++;
                    playerIndex = (playerIndex + 1) % allPlayers.length;
                }
            }
        }
        catch (ex) {
            log.exception(ex);
            broadcastMessage(`(Мара) Обнаружена ошибка. Мара остановлена.`, createHordeColor(255, 255, 0, 0));
            Mara.CanRun = false;
            return;
        }

        Mara.Info(`Mara successfully engaged. Have fun! ^^`);
    };

    static AttachToPlayer(playerId: number, processedSettlements: Array<Settlement>, tickOffset: number = 0): void {
        Mara.Debug(`Begin attach to player ${playerId}`);
        let settlementData = MaraUtils.GetSettlementData(playerId);

        if (!settlementData) {
            return;
        }

        if (processedSettlements.find((v) => v == settlementData.Settlement)) {
            Mara.Info(`Skipping player ${playerId}: settlement is already bound to another controller`);
            return;
        }

        if (!settlementData.Player.IsLocal) {
            Mara.Info(`Skipping player ${playerId}: player is not local`);
            return;
        }

        if (!settlementData.MasterMind) {
            Mara.Info(`Unable to attach to player ${playerId}: player is not controlled by MasterMind`);
            return;
        }

        let controller = new MaraSettlementController(
            settlementData.Settlement, 
            settlementData.MasterMind, 
            settlementData.Player,
            tickOffset
        );

        let settlementUnitsCache = MaraUnitCache.GetSettlementCache(settlementData.Settlement)!;
        settlementUnitsCache.BindToSettlementController(controller);
        
        Mara.controllers.push(controller);
        processedSettlements.push(settlementData.Settlement);
        
        Mara.Info(`Successfully attached to player ${playerId}`);
    };

    //#region logging helpers
    static Log(level: MaraLogLevel, message: string) {
        switch (level) {
            case MaraLogLevel.Debug:
                DebugLogger.WriteLine(`D ${message}`);
                break;
            case MaraLogLevel.Info:
                Mara.Logger.info(message);
                break;
            case MaraLogLevel.Warning:
                Mara.Logger.warning(message);
                break;
            case MaraLogLevel.Error:
                Mara.Logger.error(message);
                break;
        }
    }
    static Debug(message: string): void {
        Mara.Log(MaraLogLevel.Debug, message);
    }
    static Info(message: string): void {
        Mara.Log(MaraLogLevel.Info, message);
    }
    static Warning(message: string): void {
        Mara.Log(MaraLogLevel.Warning, message);
    }
    static Error(message: string): void {
        Mara.Log(MaraLogLevel.Error, message);
    }
    //#endregion
}