import { MaraUtils } from "../../../MaraUtils";
import { MaraSquadBattleState } from "./MaraSquadBattleState";
import { MaraSquadState } from "./MaraSquadState";
import { MaraUnitCacheItem } from "../../../Common/Cache/MaraUnitCacheItem";

export abstract class MaraSquadGatheringUpState extends MaraSquadState {
    private startTick: number | null = null;
    
    OnEntry(): void {
        if (this.squad.CurrentMovementPoint) {
            let closestToTargetUnit: MaraUnitCacheItem | null = null;
            let minDistance = Infinity;

            for (let unit of this.squad.Units) {
                let unitDistance = this.distanceToTargetCell(unit);
                
                if (unitDistance < minDistance) {
                    minDistance = unitDistance;
                    closestToTargetUnit = unit;
                }
            }

            if (closestToTargetUnit) {
                MaraUtils.IssueMoveCommand(this.squad.Units, this.squad.Controller.Player, closestToTargetUnit.UnitCell);
            }
        }
    }
    
    OnExit(): void {}
    
    Tick(tickNumber: number): void {
        if (this.startTick == null) {
            this.startTick = tickNumber;
        }
        
        if (this.squad.IsEnemyNearby()) {
            this.squad.SetState(new MaraSquadBattleState(this.squad));
            return;
        }
        
        let location = this.squad.GetLocation();

        if (location.Spread <= this.squad.MinSpread * this.squad.Controller.SquadsSettings.MinSpreadMultiplier) {
            this.onGatheredUp();
            return;
        }

        if (this.squad.IsAllUnitsIdle()) {
            this.onGatheredUp();
            return;
        }

        if (tickNumber - this.startTick > this.squad.Controller.SquadsSettings.GatherUpTimeout) {
            this.onGatheredUp();
            return;
        }
    }

    protected abstract onGatheredUp(): void;

    private distanceToTargetCell(unit: MaraUnitCacheItem): number {
        let pathLength = MaraUtils.GetUnitPathLength(unit);

        return pathLength ?? MaraUtils.ChebyshevDistance(unit.UnitCell, this.squad.CurrentMovementPoint!);
    }
}