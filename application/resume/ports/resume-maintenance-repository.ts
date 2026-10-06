export interface ResumeMaintenanceRepository {
    listStorageKeys(): Promise<string[]>;
}