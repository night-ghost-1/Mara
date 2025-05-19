
export interface MaraLogger {
    Debug(message: string): void;
    Info(message: string): void;
    Warning(message: string): void;
    Error(message: string): void;
}