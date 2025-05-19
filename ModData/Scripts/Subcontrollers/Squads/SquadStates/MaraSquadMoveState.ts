import { MaraUtils } from "../../../MaraUtils";
import { MaraSquadAttackState } from "./MaraSquadAttackState";
import { MaraSquadIdleState } from "./MaraSquadIdleState";
import { MaraSquadState } from "./MaraSquadState";

export class MaraSquadMoveState extends MaraSquadState {
    private timeoutTick: number = Infinity;
    
    OnEntry(): void {
        this.initiateMovement();
    }
    
    OnExit(): void {}
    
    Tick(tickNumber: number): void {
        if (this.squad.MovementPath != null) {
            this.initiateMovement();
            return;
        }

        if (this.squad.AttackPath != null) {
            this.squad.SetState(new MaraSquadAttackState(this.squad));
            return;
        }

        if (!this.squad.CurrentMovementPoint) {
            this.squad.SetState(new MaraSquadIdleState(this.squad));
            return;
        }
        
        let location = this.squad.GetLocation();
        let distance = MaraUtils.ChebyshevDistance(
            this.squad.CurrentMovementPoint, 
            location.Point
        );
        
        if (!this.timeoutTick) {
            this.timeoutTick = tickNumber + distance * 1000 * 3; // given that the speed will be 1 cell/s
        }

        if (this.squad.IsAllUnitsIdle() || tickNumber > this.timeoutTick) { // не шмогли...
            this.squad.SetState(new MaraSquadIdleState(this.squad));
            return;
        }

        if (distance <= this.squad.MovementPrecision) {
            this.squad.CurrentMovementPoint = this.squad.SelectNextMovementPoint();

            if (
                !this.squad.CurrentMovementPoint ||
                this.squad.CurrentMovementPoint == this.squad.CurrentPath![this.squad.CurrentPath!.length - 1]
            ) {
                this.squad.SetState(new MaraSquadIdleState(this.squad));
            }
            else {
                MaraUtils.IssueMoveCommand(this.squad.Units, this.squad.Controller.Player, this.squad.CurrentMovementPoint);
            }
            
            return;
        }
    }
}