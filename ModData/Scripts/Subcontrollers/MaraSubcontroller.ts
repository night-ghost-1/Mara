import { MaraSettlementController } from "../MaraSettlementController";
import { MaraLogLevel } from "../Mara";
import { MaraLogger } from "../Common/MaraLogger";

export abstract class MaraSubcontroller implements MaraLogger {
    protected readonly settlementController: MaraSettlementController;

    constructor (parent: MaraSettlementController) {
        this.settlementController = parent;
    }

    abstract Tick(tickNumber: number): void;

    Log(level: MaraLogLevel, message: string): void {
        let logMessage = `[${this.constructor.name}] ${message}`;
        this.settlementController.Log(level, logMessage);
    }

    Debug(message: string): void {
        this.Log(MaraLogLevel.Debug, message);
    }

    Info(message: string): void {
        this.Log(MaraLogLevel.Info, message);
    }

    Warning(message: string): void {
        this.Log(MaraLogLevel.Warning, message);
    }

    Error(message: string): void {
        this.Log(MaraLogLevel.Error, message);
    }
}