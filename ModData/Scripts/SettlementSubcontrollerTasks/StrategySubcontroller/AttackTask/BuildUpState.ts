import { Settlement, TileType } from "library/game-logic/horde-types";
import { MaraMap } from "../../../Common/MapAnalysis/MaraMap";
import { MaraProductionRequest } from "../../../Common/MaraProductionRequest";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { MaraUtils } from "../../../MaraUtils";
import { ProductionTaskState } from "../../ProductionTaskState";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { ExterminatingState } from "./ExterminatingState";

export class BuildUpState extends ProductionTaskState {
    private enemy: Settlement;
    private needBuildBridge: boolean = false;
    
    constructor(
        enemy: Settlement,
        task: SettlementSubcontrollerTask, 
        settlementController: MaraSettlementController,
    ) {
        super(task, settlementController);
        this.enemy = enemy;
    }

    protected onEntry(): boolean {
        return !MaraUtils.IsSettlementDefeated(this.enemy);
    }

    protected onExit(): void {
        //do nothing
    }

    protected onTargetCompositionReached(): void {
        this.task.SetState(new ExterminatingState(this.enemy, this.task, this.settlementController));
    }

    protected onProductionTimeout(): void {
        this.task.SetState(new ExterminatingState(this.enemy, this.task, this.settlementController));
    }

    protected getProductionRequests(): Array<MaraProductionRequest> {
        this.task.Debug(`Proceeding to build-up against '${this.enemy.TownName}'.`);
        let armyToProduce = this.settlementController.StrategyController.GetSettlementAttackArmyComposition(this.enemy);

        let result = new Array<MaraProductionRequest>();

        armyToProduce.forEach(
            (value, key) => {
                for (let i = 0; i < value; i++) {
                    result.push(this.makeProductionRequest(key, null, null, false, this.settlementController.Settings.Priorities.AttackUnitsProduction));
                }
            }
        );

        let settlementLocation = this.settlementController.GetSettlementLocation();

        if (settlementLocation) {
            let attackTarget = this.settlementController.StrategyController.GetOffensiveTarget(this.enemy);

            if (attackTarget) {
                let paths = MaraMap.GetPaths(settlementLocation.Center, attackTarget.UnitCell, [TileType.Water]);
                
                let waterPaths = paths.filter(
                    (p) => p.Nodes.findIndex(
                        (n) => n.TileType == TileType.Water
                    ) > -1
                );

                let walkablePathsWeigth = 2 * (paths.length - waterPaths.length);
                let waterPathsWeigth = waterPaths.length;

                let targetProbability = 100 * walkablePathsWeigth / (walkablePathsWeigth + waterPathsWeigth);
                let random = MaraUtils.Random(this.settlementController.MasterMind, 100);

                if (random >= targetProbability) {
                    let randomPath = MaraUtils.RandomSelect(this.settlementController.MasterMind, paths);
                    
                    if (randomPath) {
                        let bridgeRequest = this.makeBridgeProductionRequest(randomPath);
                        
                        if (bridgeRequest) {
                            result.push(bridgeRequest);
                            this.needBuildBridge = true;
                        }
                    }
                }
            }
        }
        
        return result;
    }

    protected getProductionTimeout(): number | null {
        let timeout = MaraUtils.Random(
            this.settlementController.MasterMind,
            this.settlementController.Settings.Timeouts.MaxBuildUpProduction,
            this.settlementController.Settings.Timeouts.MinBuildUpProduction
        );

        if (this.needBuildBridge) {
            timeout *= 2;
        }

        return timeout;
    }
}