import { MaraSquadGatheringUpState } from "./MaraSquadGatheringUpState";
import { MaraSquadIdleState } from "./MaraSquadIdleState";

export class MaraSquadIdleGatheringUpState  extends MaraSquadGatheringUpState {
    protected onGatheredUp(): void {
        this.squad.SetState(new MaraSquadIdleState(this.squad));
    }

    IsIdle(): boolean {
        return true;
    }
}