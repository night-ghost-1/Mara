import { MaraUtils } from "../../../MaraUtils";
import { MaraSquadState } from "./MaraSquadState";
import { MaraSquadBattleState } from "./MaraSquadBattleState";
import { MaraSquadAttackState } from "./MaraSquadAttackState";
import { MaraUnitCacheItem } from "../../../Common/Cache/MaraUnitCacheItem";

export class MaraSquadCaptureState extends MaraSquadState {
    OnEntry(): void {
        let location = this.squad.GetLocation();
        MaraUtils.IssueMoveCommand(this.squad.Units, this.squad.Controller.Player, location.Point);
    }
    
    OnExit(): void {
        
    }
    
    Tick(tickNumber: number): void {
        if (this.squad.IsEnemyNearby()) {
            this.squad.SetState(new MaraSquadBattleState(this.squad));
            return;
        }

        if (tickNumber % 50 == 0) {
            if (!this.distributeCapturingUnits()) {
                this.squad.Attack(this.squad.CurrentPath!);
                this.squad.SetState(new MaraSquadAttackState(this.squad));
                return;
            }
        }
    }

    private getCapturableUnitsNearby(): Array<MaraUnitCacheItem> {
        let units = MaraUtils.GetSettlementUnitsAroundPoint(
            this.squad.GetLocation().Point, 
            this.squad.Controller.SquadsSettings.EnemySearchRadius,
            undefined,
            (unit) => {return unit.Unit.BattleMind.CanBeCapturedNow() && !MaraUtils.IsBuildingConfigId(unit.UnitCfgId)},
            true
        );

        return units;
    }

    private distributeCapturingUnits(): boolean {
        let capturableUnits = this.getCapturableUnitsNearby();

        if (capturableUnits.length == 0) {
            return false;
        }
        
        let capturingUnits: Array<MaraUnitCacheItem> = [];

        for (let unit of this.squad.Units) {
            if (MaraUtils.IsCapturingConfigId(unit.UnitCfgId)) {
                capturingUnits.push(unit);
            }
        }

        if (capturingUnits.length == 0) {
            return false;
        }

        let capturingUnitIndex = 0;

        for (let unit of capturableUnits) {
            let capturingUnit = capturingUnits[capturingUnitIndex];

            MaraUtils.IssueCaptureCommand(
                [capturingUnit], 
                this.squad.Controller.Player, 
                unit.UnitCell
            );
            
            capturingUnitIndex ++;

            if (capturingUnitIndex >= capturingUnits.length) {
                break;
            }
        }

        return true;
    }
}