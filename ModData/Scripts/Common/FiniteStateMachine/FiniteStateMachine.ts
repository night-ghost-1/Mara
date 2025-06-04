import { MaraLogger } from "../MaraLogger";
import { FsmState } from "./FsmState";

export abstract class FiniteStateMachine implements MaraLogger {
    static nextIdentifier: number = 0;
    
    protected logger: MaraLogger;
    
    protected state: FsmState | null;
    protected nextState: FsmState | null;

    private id: number;

    constructor(logger: MaraLogger) {
        this.logger = logger;
        this.state = null;
        this.nextState = null;

        this.id = FiniteStateMachine.nextIdentifier;
        FiniteStateMachine.nextIdentifier ++;
    }
    
    Tick(tickNumber: number): void {
        if (this.state) {
            this.state.Tick(tickNumber);
        }

        this.onTick(tickNumber);
        
        if (this.nextState) {
            if (this.state) {
                this.Debug(`Leaving state ${this.state.constructor.name}`);
                this.state.OnExit();
            }
            
            this.state = this.nextState;
            this.nextState = null;
            this.Debug(`Entering state ${this.state.constructor.name}, tick ${tickNumber}`);
            this.state.OnEntry();
        }
    }

    SetState(state: FsmState): void {
        this.nextState = state;
    }

    ClearState(): void {
        if (this.state) {
            this.state.OnExit();
            this.state = null;
        }
    }
    
    Debug(message: string): void {
        this.logger.Debug(this.makeLogMessage(message));
    }

    Info(message: string): void {
        this.logger.Debug(this.makeLogMessage(message));
    }

    Warning(message: string): void {
        this.logger.Debug(this.makeLogMessage(message));
    }

    Error(message: string): void {
        this.logger.Debug(this.makeLogMessage(message));
    }

    ToString(): string {
        return `${this.constructor.name}(${this.id})`
    }

    protected abstract onTick(tickNumber: number): void;

    private makeLogMessage(message: string): string {
        return `${this.ToString()}: ${message}`;
    }
}