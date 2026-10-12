export interface OperationsRepository {
    getOverview(): Promise<{ users: number; jobs: number; matches: number; feedbacks: number; sources: { id: string; name: string; active: boolean }[] }>;
    setSourceActive(id: string, active: boolean): Promise<boolean>;
}
