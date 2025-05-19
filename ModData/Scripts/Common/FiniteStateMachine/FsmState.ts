
export abstract class FsmState {
    abstract OnEntry(): void;
    abstract OnExit(): void;
    abstract Tick(tickNumber: number): void;
}