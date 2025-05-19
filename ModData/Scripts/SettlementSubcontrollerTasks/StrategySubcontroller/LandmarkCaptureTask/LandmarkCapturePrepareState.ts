import { TileType } from "library/game-logic/horde-types";
import { MaraMap } from "../../../Common/MapAnalysis/MaraMap";
import { MaraProductionRequest } from "../../../Common/MaraProductionRequest";
import { MaraSettlementController } from "../../../MaraSettlementController";
import { ProductionTaskState } from "../../ProductionTaskState";
import { SettlementSubcontrollerTask } from "../../SettlementSubcontrollerTask";
import { LandmarkCaptureState } from "./LandmarkCaptureState";
import { MaraPoint } from "../../../Common/MaraPoint";

export class LandmarkCapturePrepareState extends ProductionTaskState {
    protected requestMiningOnInsufficientResources = false;
    
    private point: MaraPoint;
    
    constructor(
        point: MaraPoint,
        task: SettlementSubcontrollerTask, 
        settlementController: MaraSettlementController,
    ) {
        super(task, settlementController);
        this.point = point;
    }

    protected onEntry(): boolean {
        return true;
    }

    protected onExit(): void {
        //do nothing
    }

    protected onTargetCompositionReached(): void {
        this.task.SetState(new LandmarkCaptureState(this.point, this.task, this.settlementController));
    }

    protected onProductionTimeout(): void {
        this.task.SetState(new LandmarkCaptureState(this.point, this.task, this.settlementController));
    }

    protected getProductionRequests(): Array<MaraProductionRequest> {
        this.task.Debug(`Proceeding to build up for attack on ${this.point.ToString()}`);

        let armyToProduce = this.settlementController.StrategyController.GetExpandAttackArmyComposition(this.point);

        let result = new Array<MaraProductionRequest>();

        armyToProduce.forEach(
            (value, key) => {
                for (let i = 0; i < value; i++) {
                    result.push(this.makeProductionRequest(key, null, null, false, this.settlementController.Settings.Priorities.LandmarkCaptureUnitsProduction));
                }
            }
        );

        let settlementLocation = this.settlementController.GetSettlementLocation();

        if (settlementLocation) {
            let path = MaraMap.GetShortestPath(
                settlementLocation.Center, 
                this.point, 
                [TileType.Water]
            );
            
            let bridgeRequest = this.makeBridgeProductionRequest(path);

            if (bridgeRequest) {
                result.push(bridgeRequest);
            }
        }
        
        return result;
    }

    protected getProductionTimeout(): number | null {
        return this.settlementController.Settings.Timeouts.ExpandPrepare;
    }
}