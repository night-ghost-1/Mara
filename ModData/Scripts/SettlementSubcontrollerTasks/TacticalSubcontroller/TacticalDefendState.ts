
import { FsmState } from "../../Common/FiniteStateMachine/FsmState";
import { MaraPoint } from "../../Common/MaraPoint";
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
        }

        for (let squad of this.hostileAttackingSquads) {
            squad.Tick(tickNumber);
        }
        
        this.tacticalController.ReinforceSquads();

        if (this.tacticalController.NeedRetreat(this.hostileAttackingSquads)) {
            this.tacticalController.Retreat();
        }

        if (!this.tacticalController.CanDefend()) {
            this.tacticalController.MakeMilitia();
        }

        this.tacticalController.UpdateDefenseTargets(this.hostileAttackingSquads);
    }

    private registerHostileSquadsAroundPoint(point: MaraPoint, radius: number): Array<MaraSquad> {
        let attackers = this.tacticalController.SettlementController.StrategyController.GetEnemiesAroundPoint(point, radius);
        
        return MaraUtils.GetSettlementsSquadsFromUnits(
            attackers, 
            this.tacticalController.SettlementController.StrategyController.EnemySettlements,
            (unit) => {
                return MaraUtils.ChebyshevDistance(
                    unit.UnitCell,
                    point
                ) <= radius
            }
        );
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

        let attackingSquads = this.registerHostileSquadsInArea(
            settlementLocation.BoundingRect
        );
        
        this.hostileAttackingSquads.push(...attackingSquads);

        for (let expandPoint of this.tacticalController.SettlementController.Expands) {
            let expandAttackers = this.registerHostileSquadsAroundPoint(
                expandPoint, 
                this.tacticalController.SettlementController.Settings.UnitSearch.ExpandEnemySearchRadius
            );

            if (expandAttackers.length > 0) {
                this.hostileAttackingSquads.push(...expandAttackers);
            }
        }
    }
}