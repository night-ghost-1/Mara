import { MaraSquadGatheringUpState } from "./MaraSquadGatheringUpState";

export class MaraSquadAttackGatheringUpState extends MaraSquadGatheringUpState {
    protected onGatheredUp(): void {
        this.resumeAttackMovement();
    }
}