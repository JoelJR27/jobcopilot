export interface JobSourceRepository {
    ensure(source: { name: string; baseUrl: string }): Promise<{ id: string; active: boolean }>;
}
