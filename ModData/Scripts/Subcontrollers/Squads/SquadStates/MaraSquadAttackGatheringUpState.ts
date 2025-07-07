import { MaraControllableSquad } from "../MaraControllableSquad";
import { MaraSquadGatheringUpState } from "./MaraSquadGatheringUpState";

export class MaraSquadAttackGatheringUpState extends MaraSquadGatheringUpState {
    private isEnrageMode = true;
    private enrageSwitchTick: number = 0;
    
    constructor(squad: MaraControllableSquad, isEnrageMode: boolean, enrageSwitchTick: number) {
        super(squad);
        this.isEnrageMode = isEnrageMode;
        this.enrageSwitchTick = enrageSwitchTick;
    }
    
    protected onGatheredUp(): void {
        this.resumeAttackMovement(this.isEnrageMode, this.enrageSwitchTick);
    }
}