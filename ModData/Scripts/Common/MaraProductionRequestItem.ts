import { BuildTracker, ProduceRequest } from "library/mastermind/mastermind-types";
import { MaraUtils } from "../MaraUtils";
import { MaraPoint } from "./MaraPoint";
import { MaraProductionRequest } from "./MaraProductionRequest";
import { Unit } from "library/game-logic/horde-types";

type TrackerChangedEventArgs = HordeResurrection.Intellect.Requests.ARequest.TrackerChangedEventArgs;

export class MaraProductionRequestItem {
    public ConfigId: string;
    public Point: MaraPoint | null;
    public Precision: number | null;
    public ProducedUnit: Unit | null = null;
    // @ts-ignore
    public ParentRequest: MaraProductionRequest;

    public get MasterMindRequest(): ProduceRequest | null {
        return this.masterMindRequest;
    }

    public get IsExecuting(): boolean {
        return this.masterMindRequest != null && !this.IsCompleted;
    }

    public set MasterMindRequest(value: ProduceRequest | null) {
        this.masterMindRequest = value;

        if (this.masterMindRequest == null) {
            return;
        }

        let that = this;

        this.trackerChangedHandler = this.masterMindRequest.TrackerChanged.connect(
            function (sender: any, args: TrackerChangedEventArgs | null) {
                if (!args) {
                    return;
                }
                
                let tracker = args.NewTracker;
                let buildTracker: BuildTracker;

                try {
                    buildTracker = MaraUtils.CastToType(tracker, BuildTracker);

                    if (!buildTracker) {
                        return;
                    }
                }
                catch (ex) {
                    return;
                }

                let unit = buildTracker.TrackUnit;
                that.ProducedUnit = unit;
            }
        );
    }

    private masterMindRequest: ProduceRequest | null = null;
    private trackerChangedHandler: any = null;
    private isForceFailed: boolean = false;

    constructor(
        configId: string,
        point: MaraPoint | null,
        precision: number | null
    ) {
        this.ConfigId = configId;
        this.Point = point;
        this.Precision = precision;
    }

    public get IsCompleted(): boolean {
        if (this.isForceFailed) {
            return true;
        }
        
        if (this.MasterMindRequest) {
            return !this.MasterMindRequest.State.IsUnfinished();
        }
        else {
            return false;
        }
    }

    public get IsSuccess(): boolean {
        if (this.isForceFailed) {
            return false;
        }
        
        if (this.MasterMindRequest) {
            return this.MasterMindRequest.State.IsSuccessfullyCompleted();
        }
        else {
            return false;
        }
    }

    public ForceFail(): void {
        this.isForceFailed = true;
    }

    public WipeResults(): void {
        this.ProducedUnit = null;
        this.masterMindRequest = null;
        this.isForceFailed = false;
    }

    public OnProductionFinished(): void {
        if (this.trackerChangedHandler) {
            this.trackerChangedHandler.disconnect();
        }
    }

    public ToString(): string {
        let location: string;

        if (this.Point) {
            location = this.Point.ToString();
        }
        else {
            location = "any location";
        }

        return `${this.ConfigId} at (${location}):${this.Precision}`;
    }
}
