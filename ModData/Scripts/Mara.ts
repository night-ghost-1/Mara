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
import { MaraSettlementControllerSettings } from "./Common/Settlement/SettlementControllerSettings";

export enum MaraLogLevel {
    Debug = 0,
    Info = 1,
    Warning = 2,
    Error = 3
}

export enum MaraDifficultyName {
    Easy = "#MindCharacter_MaraEasy",
    Medium = "#MindCharacter_MaraMedium",
    Hard = "#MindCharacter_MaraHard",
    Brutal = "#MindCharacter_MaraBrutal"
}

class MaraProfilersCollection {
    [key: string]: MaraProfiler;
}

class SettlementControllerSettingsCollection {
    [key: string]: MaraSettlementControllerSettings;
}

/*
    Class organizes work of each settlement controller since we can have multiple 
    of them in one game. Also provides some helper functions.

    The class itself is static by its nature
*/

export class Mara {
    private static profilers: MaraProfilersCollection = {};
    private static controllerSettings: SettlementControllerSettingsCollection = {};
    
    static CanRun = true;
    static Logger: Logger;
    
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
                if (tickNumber < 10) { // doing nothing for first 10 ticks since not all core objects may be properly inited
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

            Mara.MakeSettlementControllerSettings();
            MaraUnitCache.Init();
            MaraUnitConfigCache.Init();
            MaraMap.Init();

            let tickOffset = 0;
            let processedSettlements: Array<Settlement> = [];
            let allPlayers = MaraUtils.GetAllPlayers();

            for (let item of allPlayers) {
                let player = Players[item.index];

                if (player.IsBot) {
                    Mara.AttachToPlayer(item.index, processedSettlements, tickOffset);
                    tickOffset ++;
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

        if (!settlementData.Player.IsLocal && !settlementData.Player.IsReplay) {
            Mara.Info(`Skipping player ${playerId}: player is not local`);
            return;
        }

        if (!settlementData.MasterMind) {
            Mara.Info(`Unable to attach to player ${playerId}: player is not controlled by MasterMind`);
            return;
        }

        let characterUid = settlementData.MasterMind.Character.Uid;
        let settings = Mara.controllerSettings[characterUid];

        if (!settings) {
            Mara.Info(`Settings for difficulty ${characterUid} not found, using difficulty ${MaraDifficultyName.Hard} instead`);
            settings = Mara.controllerSettings[MaraDifficultyName.Hard];
        }

        let controller = new MaraSettlementController(
            settlementData.Settlement, 
            settlementData.MasterMind, 
            settlementData.Player,
            tickOffset,
            settings
        );

        let settlementUnitsCache = MaraUnitCache.GetSettlementCache(settlementData.Settlement)!;
        settlementUnitsCache.BindToSettlementController(controller);
        
        Mara.controllers.push(controller);
        processedSettlements.push(settlementData.Settlement);
        
        Mara.Info(`Successfully attached to player ${playerId} with difficulty ${characterUid}`);
    };

    static MakeSettlementControllerSettings() {
        let hardSettings = new MaraSettlementControllerSettings(
            MaraDifficultyName.Hard, // difficulty: string,

            100, // minAttackStrength: number,
            1.5, // attackStrengthToEnemyStrengthRatio: number,

            4,  // maxUsedOffensiveCfgIdCount: number,
            1, // maxUsedDefensiveCfgIdCount: number,
            3, // maxSameCfgIdProducerCount: number,
            10, // settlementPointDefenceBatchCount: number,
            1, // gatePointDefenceBatchCount: number,
            1, // expandPointDefenceBatchCount: number,

            true, //useSquadsEnrageMode: boolean,

            3, // minMinersPerMine: number,
            5, // woodcutterBatchSize: number,
            5, // minWoodcuttersPerSawmill: number,
            13, // maxWoodcuttersPerSawmill: number,
            3, // housingBatchSize: number,

            0 * 50, // strategyActionSuccessMinCooldown: number,
            10 * 50, // strategyActionSuccessMaxCooldown: number,
            10 * 50, // strategyActionFailMinCooldown: number,
            20 * 50, // strategyActionFailMaxCooldown: number,
            0.5 * 60 * 50, // strategyActionUnavailMinCooldown: number,
            1 * 60 * 50, // strategyActionUnavailMaxCooldown: number,
            3 * 60 * 50, // settlementEnhanceMinCooldown: number,
            5 * 60 * 50, // settlementEnhanceMaxCooldown: number,

            5 // defendedGatesCount: number
        );

        Mara.controllerSettings[MaraDifficultyName.Hard] = hardSettings;
        
        let brutalSettings = Object.create(hardSettings) as MaraSettlementControllerSettings; // Brutal differs from Hard only in additional resources income
        brutalSettings.Difficulty = MaraDifficultyName.Brutal;
        Mara.controllerSettings[MaraDifficultyName.Brutal] = brutalSettings;

        let mediumSettings = new MaraSettlementControllerSettings(
            MaraDifficultyName.Medium, // difficulty: string,

            100, // minAttackStrength: number,
            1, // attackStrengthToEnemyStrengthRatio: number,

            3,  // maxUsedOffensiveCfgIdCount: number,
            1, // maxUsedDefensiveCfgIdCount: number,
            2, // maxSameCfgIdProducerCount: number,
            5, // settlementPointDefenceBatchCount: number,
            1, // gatePointDefenceBatchCount: number,
            1, // expandPointDefenceBatchCount: number,

            false, //useSquadsEnrageMode: boolean,

            2, // minMinersPerMine: number,
            5, // woodcutterBatchSize: number,
            5, // minWoodcuttersPerSawmill: number,
            10, // maxWoodcuttersPerSawmill: number,
            2, // housingBatchSize: number,

            10 * 50, // strategyActionSuccessMinCooldown: number,
            20 * 50, // strategyActionSuccessMaxCooldown: number,
            20 * 50, // strategyActionFailMinCooldown: number,
            40 * 50, // strategyActionFailMaxCooldown: number,
            1 * 60 * 50, // strategyActionUnavailMinCooldown: number,
            1.5 * 60 * 50, // strategyActionUnavailMaxCooldown: number,
            5 * 60 * 50, // settlementEnhanceMinCooldown: number,
            7 * 60 * 50, // settlementEnhanceMaxCooldown: number,

            3 // defendedGatesCount: number
        );

        Mara.controllerSettings[MaraDifficultyName.Medium] = mediumSettings;

        let easySettings = new MaraSettlementControllerSettings(
            MaraDifficultyName.Easy, // difficulty: string,

            50, // minAttackStrength: number,
            0.8, // attackStrengthToEnemyStrengthRatio: number,

            2,  // maxUsedOffensiveCfgIdCount: number,
            0, // maxUsedDefensiveCfgIdCount: number,
            1, // maxSameCfgIdProducerCount: number,
            0, // settlementPointDefenceBatchCount: number,
            0, // gatePointDefenceBatchCount: number,
            0, // expandPointDefenceBatchCount: number,

            false, //useSquadsEnrageMode: boolean,

            1, // minMinersPerMine: number,
            3, // woodcutterBatchSize: number,
            3, // minWoodcuttersPerSawmill: number,
            7, // maxWoodcuttersPerSawmill: number,
            1, // housingBatchSize: number,

            20 * 50, // strategyActionSuccessMinCooldown: number,
            40 * 50, // strategyActionSuccessMaxCooldown: number,
            30 * 50, // strategyActionFailMinCooldown: number,
            50 * 50, // strategyActionFailMaxCooldown: number,
            1 * 60 * 50, // strategyActionUnavailMinCooldown: number,
            2 * 60 * 50, // strategyActionUnavailMaxCooldown: number,
            7 * 60 * 50, // settlementEnhanceMinCooldown: number,
            10 * 60 * 50, // settlementEnhanceMaxCooldown: number,

            0 // defendedGatesCount: number
        );

        Mara.controllerSettings[MaraDifficultyName.Easy] = easySettings;
    }

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