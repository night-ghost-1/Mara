import { MaraControllableSquad } from "../MaraControllableSquad";
import { FsmState } from "../../../Common/FiniteStateMachine/FsmState";
import { MaraUtils } from "../../../MaraUtils";

export abstract class MaraSquadState extends FsmState {
    protected squad: MaraControllableSquad;
    
    constructor(squad: MaraControllableSquad) {
        super();
        this.squad = squad;
    }

    IsIdle(): boolean {
        return false;
    }

    protected initiateMovement() {
        this.squad.CurrentPath = this.squad.MovementPath;
        this.squad.MovementPath = null;

        this.squad.CurrentMovementPoint = this.squad.SelectNextMovementPoint();

        if (this.squad.CurrentMovementPoint) {
            MaraUtils.IssueMoveCommand(this.squad.Units, this.squad.Controller.Player, this.squad.CurrentMovementPoint);
        }
    }

    protected initiateAttack() {
        this.squad.CurrentPath = this.squad.AttackPath;
        this.squad.AttackPath = null;

        this.squad.CurrentMovementPoint = this.squad.SelectNextMovementPoint();

        if (this.squad.CurrentMovementPoint) {
            MaraUtils.IssueMoveCommand(this.squad.Units, this.squad.Controller.Player, this.squad.CurrentMovementPoint);
        }
    }
}