import { MaraUnitCacheItem } from "../../../Common/Cache/MaraUnitCacheItem";
import { MaraPoint } from "../../../Common/MaraPoint";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { SubcontrollerTaskState } from "../../SubcontrollerTaskState";

export class LandmarkCaptureState extends SubcontrollerTaskState {
    // @ts-ignore
    private currentTarget: MaraUnitCacheItem | null;
    // @ts-ignore
    private timeoutTick: number | null;
    private point: MaraPoint;

    constructor(point: MaraPoint, task: SettlementSubcontrollerTask, settlementController: MaraSettlementController) {
        super(task, settlementController);
        this.point = point;
    }
    
    OnEntry(): void {
        if (!this.selectAndAttackEnemy()) {
            this.task.Debug(`Landmark is captured`);
            this.task.Complete(true);
            return;
        }

        this.timeoutTick = null;
    }

    OnExit(): void {
        this.settlementController.TacticalController.Idle();
    }

    Tick(tickNumber: number): void {
        if (this.timeoutTick == null) {
            this.timeoutTick = tickNumber + this.settlementController.Settings.Timeouts.Exterminate;
        }
        else if (tickNumber > this.timeoutTick) {
            this.settlementController.Debug(`Landmark capture is too long-drawn, discontinuing`);
            this.task.Complete(false);
            return;
        }
        
        if (tickNumber % 10 != 0) {
            return;
        }

        let combativityIndex = this.settlementController.TacticalController.OffenseCombativityIndex;
        
        if (combativityIndex >= this.settlementController.Settings.ControllerStates.ExterminatingLossRatioThreshold) {
            if (!this.currentTarget || !this.currentTarget.UnitIsAlive) {
                if ( !this.selectTarget() ) {
                    this.task.Debug(`Landmark is captured`);
                    this.task.Complete(true);
                    return;
                }
            }
        }
        else {
            this.settlementController.Debug(`Failed to capture landmark: current combativity index '${combativityIndex}' is too low. Retreating...`);
            this.settlementController.TacticalController.Retreat();
            this.task.Complete(false);
            return;
        }
    }

    private selectTarget(): boolean {
        this.currentTarget = null;

        let target = this.settlementController.StrategyController.GetExpandOffenseTarget(this.point);

        if (target) {
            this.currentTarget = target;
            this.settlementController.TacticalController.Attack(target);
        }

        return target != null;
    }

    private selectAndAttackEnemy(): boolean {
        this.settlementController.TacticalController.ComposeSquads(1);
        return this.selectTarget();
    }
}