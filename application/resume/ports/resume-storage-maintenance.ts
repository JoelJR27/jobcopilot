import type { ExecutionContext } from '@/application/operations/execution-context';
export interface ResumeStorageMaintenance {
    listVersions(prefix: string, context?: ExecutionContext): Promise<{ key: string; versionId: string; isDeleteMarker: boolean; lastModified: Date }[]>;
    deleteVersion(key: string, versionId: string, context?: ExecutionContext): Promise<void>;
}
