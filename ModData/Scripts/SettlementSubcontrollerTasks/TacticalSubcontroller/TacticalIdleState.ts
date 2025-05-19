
import { FsmState } from "../../Common/FiniteStateMachine/FsmState";
import { TacticalSubcontroller } from "../../Subcontrollers/TacticalSubcontroller";

export class TacticalIdleState extends FsmState {
    private tacticalController: TacticalSubcontroller;

    constructor(
        controller: TacticalSubcontroller
    ) {
        super();
        this.tacticalController = controller;
    }
    
    OnEntry(): void {
        
    }

    OnExit(): void {
        // do nothing
    }

    Tick(tickNumber: number): void {
        let retreatLocations = this.tacticalController.GetRetreatLocations();
        let healingLocations = retreatLocations.filter((l) => l.HasHealers);

        if (retreatLocations.length > 0) {
            for (let squad of this.tacticalController.AllSquads) {
                if (squad.IsIdle()) {
                    this.tacticalController.SendSquadToOneOfLocations(squad, retreatLocations, healingLocations);
                }
            }
        }
    }
}