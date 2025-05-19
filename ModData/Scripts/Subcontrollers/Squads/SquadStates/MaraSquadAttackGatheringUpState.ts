import { MaraSquadAttackState } from "./MaraSquadAttackState";
import { MaraSquadGatheringUpState } from "./MaraSquadGatheringUpState";

export class MaraSquadAttackGatheringUpState extends MaraSquadGatheringUpState {
    protected onGatheredUp(): void {
        this.squad.Attack(this.squad.CurrentPath!);
        this.squad.SetState(new MaraSquadAttackState(this.squad));
    }
}