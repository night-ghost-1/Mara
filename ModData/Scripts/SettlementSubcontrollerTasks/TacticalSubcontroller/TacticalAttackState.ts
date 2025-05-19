import { MaraUnitCacheItem } from "../../Common/Cache/MaraUnitCacheItem";
import { FsmState } from "../../Common/FiniteStateMachine/FsmState";
import { MaraPoint } from "../../Common/MaraPoint";
import { MaraUtils } from "../../MaraUtils";
import { TacticalSubcontroller } from "../../Subcontrollers/TacticalSubcontroller";

export class TacticalAttackState extends FsmState {
    private currentTarget: MaraUnitCacheItem;
    private tacticalController: TacticalSubcontroller;
    private attackPath: Array<MaraPoint> = [];

    constructor(
        target: MaraUnitCacheItem, 
        controller: TacticalSubcontroller
    ) {
        super();
        this.currentTarget = target;
        this.tacticalController = controller;
    }
    
    OnEntry(): void {
        this.tacticalController.Debug(`Selected '${this.currentTarget.Unit.Name}' as attack target`);

        let settlementLocation = this.tacticalController.SettlementController.GetSettlementLocation();
        let targetPoint = this.currentTarget.UnitCell;

        if (settlementLocation) {
            let path = this.tacticalController.SettlementController.StrategyController.GetPath(
                settlementLocation.Center,
                targetPoint
            );

            if (path.length > 1) {
                this.attackPath = path.slice(1);
            }
            else {
                this.attackPath = path;
            }
        }
        else {
            this.attackPath = [this.currentTarget.UnitCell];
        }

        this.tacticalController.SettlementController.Debug(`Selected as attack path:`);
        
        for (let point of this.attackPath) {
            this.tacticalController.SettlementController.Debug(point.ToString());
        }

        if (this.tacticalController.SettlementController.Settings.Squads.DebugSquads) {
            MaraUtils.DrawPath(this.attackPath, this.tacticalController.SettlementController.Settlement.SettlementColor);
        }

        let ratio = MaraUtils.RandomSelect<number>(
            this.tacticalController.SettlementController.MasterMind,
            this.tacticalController.SettlementController.Settings.Combat.OffensiveToDefensiveRatios
        ) ?? 1;
        
        this.tacticalController.Debug(`Calculated attack to defense ratio: ${ratio}`);
        
        this.tacticalController.ComposeSquads(ratio);
        this.tacticalController.IssueAttackCommand(this.attackPath);
    }

    OnExit(): void {
        // do nothing
    }

    Tick(tickNumber: number): void {
        this.tacticalController.ReinforceSquads();
        
        if (this.currentTarget!.UnitIsAlive) {
            let pullbackLocations = this.tacticalController.GetPullbackLocations();
            let healingLocations = pullbackLocations.filter((l) => l.HasHealers);

            for (let squad of this.tacticalController.OffensiveSquads) {
                if (pullbackLocations.length > 0) {
                    if (squad.CombativityIndex < this.tacticalController.SettlementController.Settings.Squads.MinCombativityIndex) {
                        this.tacticalController.SendSquadToOneOfLocations(squad, pullbackLocations, healingLocations);
                    }
                }

                if (squad.IsIdle() && squad.CombativityIndex >= 1) {
                    this.tacticalController.SendSquadToAttack(squad, this.attackPath);
                }
            }
        }
    }
}