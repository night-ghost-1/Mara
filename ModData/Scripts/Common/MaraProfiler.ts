import { Mara } from "../Mara";

export class MaraProfiler {
    private message: string;
    private callCount: number;
    private executionTime: number;
    private startTime: number;

    public get ExecutionTime(): number {
        return this.executionTime;
    }

    constructor(message: string, start: boolean = false) {
        this.message = message;
        this.callCount = 0;
        this.executionTime = 0;
        this.startTime = 0;

        if (start) {
            this.Start();
        }
    }

    public Reset() {
        this.callCount = 0;
        this.executionTime = 0;
    }

    public Print(): void {
        Mara.Debug(`${this.message} took ${this.executionTime} ms, call count: ${this.callCount}`);
    }

    public Profile(call: () => void): void {
        this.Start();
        try {
            call();
        }
        finally {
            this.Stop();
        }
    }

    public Start(): void {
        this.startTime = Date.now();
    }

    public Stop(print: boolean = false) {
        let execTime = Date.now() - this.startTime;
        this.executionTime += execTime;
        this.callCount++;

        if (print) {
            this.Print();
        }
    }
}
