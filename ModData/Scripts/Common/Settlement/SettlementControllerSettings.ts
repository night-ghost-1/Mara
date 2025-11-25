import { MaraPriority } from "../MaraPriority";

export class MaraSettlementControllerSettings {
    public UnitSearch: UnitSearchSettings = new UnitSearchSettings();
    public Timeouts: TimeoutsSettings = new TimeoutsSettings();
    public Squads: SquadsSettings = new SquadsSettings();
    public ControllerStates: ControllerStatesSettings = new ControllerStatesSettings();
    public ResourceMining: ResourceMiningSettings = new ResourceMiningSettings();
    public Combat: CombatSettings = new CombatSettings();
    public Priorities: Priorities = new Priorities();

    public Difficulty;

    constructor(
        difficulty: string,

        minAttackStrength: number,
        attackStrengthToEnemyStrengthRatio: number,

        maxUsedOffensiveCfgIdCount: number,
        maxUsedDefensiveCfgIdCount: number,
        maxSameCfgIdProducerCount: number,
        settlementPointDefenceBatchCount: number,
        gatePointDefenceBatchCount: number,
        expandPointDefenceBatchCount: number,
        
        useSquadsEnrageMode: boolean,

        minMinersPerMine: number,
        woodcutterBatchSize: number,
        minWoodcuttersPerSawmill: number,
        maxWoodcuttersPerSawmill: number,
        housingBatchSize: number,
        
        strategyActionSuccessMinCooldown: number,
        strategyActionSuccessMaxCooldown: number,
        strategyActionFailMinCooldown: number,
        strategyActionFailMaxCooldown: number,
        strategyActionUnavailMinCooldown: number,
        strategyActionUnavailMaxCooldown: number,
        settlementEnhanceMinCooldown: number,
        settlementEnhanceMaxCooldown: number,

        defendedGatesCount: number
    ) {
        this.Difficulty = difficulty;
        
        this.Timeouts.StrategyActionSuccessMinCooldown = strategyActionSuccessMinCooldown;
        this.Timeouts.StrategyActionSuccessMaxCooldown = strategyActionSuccessMaxCooldown;

        this.Timeouts.StrategyActionFailMinCooldown = strategyActionFailMinCooldown;
        this.Timeouts.StrategyActionFailMaxCooldown = strategyActionFailMaxCooldown;

        this.Timeouts.StrategyActionUnavailMinCooldown = strategyActionUnavailMinCooldown;
        this.Timeouts.StrategyActionUnavailMaxCooldown = strategyActionUnavailMaxCooldown;

        this.Timeouts.SettlementEnhanceMinCooldown = settlementEnhanceMinCooldown;
        this.Timeouts.SettlementEnhanceMaxCooldown = settlementEnhanceMaxCooldown;

        this.ControllerStates.DefendedGatesCount = defendedGatesCount;
        this.ControllerStates.MaxSameCfgIdProducerCount = maxSameCfgIdProducerCount;

        this.ControllerStates.MinAttackStrength = minAttackStrength;

        this.ResourceMining.MinMinersPerMine = minMinersPerMine;
        this.ResourceMining.WoodcutterBatchSize = woodcutterBatchSize;
        this.ResourceMining.MinWoodcuttersPerSawmill = minWoodcuttersPerSawmill;
        this.ResourceMining.MaxWoodcuttersPerSawmill = maxWoodcuttersPerSawmill;
        this.ResourceMining.HousingBatchSize = housingBatchSize;

        this.Combat.MaxUsedOffensiveCfgIdCount = maxUsedOffensiveCfgIdCount;
        this.Combat.MaxUsedDefensiveCfgIdCount = maxUsedDefensiveCfgIdCount;
        
        this.Combat.AttackStrengthToEnemyStrengthRatio = attackStrengthToEnemyStrengthRatio;
        this.Combat.SettlementPointDefenceBatchCount = settlementPointDefenceBatchCount;
        this.Combat.GatePointDefenceBatchCount = gatePointDefenceBatchCount;
        this.Combat.ExpandPointDefenceBatchCount = expandPointDefenceBatchCount;

        this.Squads.UseEnrageMode = useSquadsEnrageMode;
    }
}

class UnitSearchSettings {
    public BuildingSearchRadius: number = 5;
    public ExpandEnemySearchRadius: number = 12;
    public TemporaryDefenceLocationRadius: number = 5;
}

class TimeoutsSettings {
    public MaxBuildUpProduction: number = 2 * 60 * 50;
    public MinBuildUpProduction: number = 0.5 * 60 * 50;

    public Exterminate: number = 5 * 60 * 50;
    public Develop: number = 2 * 60 * 50;
    
    public ExpandBuild: number = 1.5 * 60 * 50;
    public ExpandPrepare: number = 5 * 60 * 50;

    public StrategyActionSuccessMinCooldown = 0 * 50;
    public StrategyActionSuccessMaxCooldown = 10 * 50;

    public StrategyActionFailMinCooldown = 10 * 50;
    public StrategyActionFailMaxCooldown = 20 * 50;
    
    public StrategyActionUnavailMinCooldown: number = 0.5 * 60 * 50;
    public StrategyActionUnavailMaxCooldown: number = 1 * 60 * 50;

    public DefaultTaskReattemptMaxCooldown: number = 20 * 50;

    public StrategyReInitMin: number = 30 * 60 * 50;
    public StrategyReInitMax: number = 60 * 60 * 50;

    public SettlementEnhanceMinCooldown: number = 3 * 60 * 50;
    public SettlementEnhanceMaxCooldown: number = 5 * 60 * 50;
    
    public UnfinishedConstructionThreshold: number = 2 * 60 * 50;

    public ResourceRequestDuration: number = 2 * 60 * 50;

    public TempDefenceLocationDuration: number = 1.5 * 60 * 50;
}

class Priorities {
    // Tasks
    public SettlementDefence: MaraPriority = MaraPriority.Absolute;
    public ExpandDefence: MaraPriority = MaraPriority.Major;
    public Attack: MaraPriority = MaraPriority.Raised;
    public LandmarkCapture: MaraPriority = MaraPriority.Normal;
    public ExpandBuild: MaraPriority = MaraPriority.Normal;
    public SettlementDevelopment: MaraPriority = MaraPriority.Normal;
    public DefenceBuild: MaraPriority = MaraPriority.Normal;
    public ProduceAdditionalHarvesters: MaraPriority = MaraPriority.Normal;
    public ExpandUpgrade: MaraPriority = MaraPriority.Low;

    // Production Requests
    public DefenceUnitsProduction: MaraPriority = MaraPriority.Absolute;
    public LandmarkCaptureUnitsProduction: MaraPriority = MaraPriority.Major;
    public ExpandDefenceUnitsProduction: MaraPriority = MaraPriority.Normal;
    public AttackUnitsProduction: MaraPriority = MaraPriority.Normal;
    public HarvesterProduction: MaraPriority = MaraPriority.Normal;
    public HousingProduction: MaraPriority = MaraPriority.Normal;
    public ReinforcementUnitsProduction: MaraPriority = MaraPriority.Background;
}

class SquadsSettings {
    public MaxSpreadMultiplier: number = 2.8;
    public MinSpreadMultiplier: number = 2;
    public EnemySearchRadius: number = 10;
    public MinCombativityIndex: number = 0.25;
    public MinStrength: number = 100;
    public DefaultMovementPrecision: number = 3;
    public KiteTimeout: number = 8 * 50;
    public KiteThresholdPositionChangeDistance: number = 5;
    public GatherUpTimeout: number = 5 * 50;

    public UseEnrageMode: boolean = true;
    public MinEnrageActivationTimeout: number = 10 * 50;
    public MaxEnrageActivationTimeout: number = 20 * 50;
    public MinEnrageCooldown: number = 10 * 50;
    public MaxEnrageCooldown: number = 30 * 50;
    public MinEnrageDuration: number = 15 * 50;
    public MaxEnrageDuration: number = 25 * 50;

    public DebugSquads: boolean = false;
}

class ControllerStatesSettings {
    public DefendedGatesCount = 5;
    public DefendedGateMinSize = 3;
    public DefendedGateMaxDistanceFromSettlement = 15;
    
    public ExterminatingLossRatioThreshold: number = 0.33;
    public MinAttackStrength: number = 100;

    public MaxHarvesterProductionBatch: number = 6;
    public MaxSameCfgIdProducerCount: number = 3;

    public DevelopmentToReinforcementRatio: number = 40;
}

class ResourceMiningSettings {
    public MinMinersPerMine: number = 3;
    public WoodcutterBatchSize: number = 5;
    public MinWoodcuttersPerSawmill: number = 5;
    public MaxWoodcuttersPerSawmill: number = 13;
    public HousingBatchSize: number = 3;

    public WoodcuttingRadius: number = 10;
    public MiningRadius: number = 15;

    public MinResourceClusterDistanceSpread: number = 10;
}

class CombatSettings {
    public PointDefenseBatchStrength: number = 100;
    public SettlementPointDefenceBatchCount: number = 10;
    public GatePointDefenceBatchCount: number = 1;
    public ExpandPointDefenceBatchCount: number = 1;

    public MaxCompositionUnitCount: number = 20;
    public MaxUsedOffensiveCfgIdCount: number = 4;
    public MaxUsedDefensiveCfgIdCount: number = 1;
    
    public OffensiveToDefensiveRatios: Array<number> = [1, 0.75, 0.5, 0.25, 0.1];
    public AttackStrengthToEnemyStrengthRatio: number = 1.5;
    public UnitSpeedClusterizationThresholds: Array<number> = [9, 14]; //this must be in ascending order
}