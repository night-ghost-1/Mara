
import { FsmState } from "../../Common/FiniteStateMachine/FsmState";
import { MaraRect } from "../../Common/MaraRect";
import { MaraUtils } from "../../MaraUtils";
import { MaraSquad } from "../../Subcontrollers/Squads/MaraSquad";
import { TacticalSubcontroller } from "../../Subcontrollers/TacticalSubcontroller";

export class TacticalDefendState extends FsmState {
    private tacticalController: TacticalSubcontroller;
    private hostileAttackingSquads: Array<MaraSquad> = [];

    constructor(
        controller: TacticalSubcontroller
    ) {
        super();
        this.tacticalController = controller;
    }
    
    OnEntry(): void {
        this.tacticalController.Debug(`Proceeding to defend`);
        this.refreshAttackersList();

        if (
            this.tacticalController.AllSquads.length == 0
        ) {
            this.tacticalController.ComposeSquads(0);
        }
        
        if (this.tacticalController.NeedRetreat(this.hostileAttackingSquads)) {
            this.tacticalController.Retreat();
        }

        this.tacticalController.UpdateDefenseTargets(this.hostileAttackingSquads);
    }

    OnExit(): void {
        this.tacticalController.DismissMilitia();
    }

    Tick(tickNumber: number): void {
        if (tickNumber % 50 == 0) {
            this.refreshAttackersList();

            if (!this.tacticalController.CanDefend()) {
                this.tacticalController.MakeMilitia();
            }

            this.tacticalController.ReinforceSquads();

            if (this.tacticalController.NeedRetreat(this.hostileAttackingSquads)) {
                this.tacticalController.Retreat();
            }

            this.tacticalController.UpdateDefenseTargets(this.hostileAttackingSquads);
        }

        for (let squad of this.hostileAttackingSquads) {
            squad.Tick(tickNumber);
        }
    }

    private registerHostileSquadsInArea(rect: MaraRect): Array<MaraSquad> {
        let attackers = this.tacticalController.SettlementController.StrategyController.GetEnemiesInArea(rect);
        
        return MaraUtils.GetSettlementsSquadsFromUnits(
            attackers, 
            this.tacticalController.SettlementController.StrategyController.EnemySettlements,
            (unit) => {return rect.IsPointInside(unit.UnitCell)}
        );
    }

    private refreshAttackersList(): void {
        this.hostileAttackingSquads = [];
        let settlementLocation = this.tacticalController.SettlementController.GetSettlementLocation();

        if (!settlementLocation) {
            return;
        }

        let defenceLocations = this.tacticalController.SettlementController.GetDefenceLocations();

        for (let location of defenceLocations) {
            let attackingSquads = this.registerHostileSquadsInArea(
                location
            );

            this.hostileAttackingSquads.push(...attackingSquads);
        }
    }
}