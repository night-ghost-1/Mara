import { SettlementSubcontrollerTask } from "../SettlementSubcontrollerTasks/SettlementSubcontrollerTask";

export class SubcontrollerRequestResult {
    IsSuccess: boolean = false;
    Task: SettlementSubcontrollerTask | null = null;
}