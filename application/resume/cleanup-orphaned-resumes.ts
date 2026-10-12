import type { ResumeMaintenanceRepository } from './ports/resume-maintenance-repository';
import type { ResumeStorageMaintenance } from './ports/resume-storage-maintenance';
import type { ExecutionContext } from '../operations/execution-context';
const ORPHAN_GRACE_PERIOD_MS = 86400000;
export interface CleanupOrphanedResumesResult { deleted: number; skipped: number; candidates: number; failed: number }
export interface CleanupOrphanedResumesDependencies { resumeRepository: ResumeMaintenanceRepository; resumeStorage: ResumeStorageMaintenance; now?: () => Date }
export class CleanupOrphanedResumes {
    private readonly now: () => Date;
    constructor(private readonly dependencies: CleanupOrphanedResumesDependencies) { this.now = dependencies.now ?? (() => new Date()); }
    async execute(context?: ExecutionContext): Promise<CleanupOrphanedResumesResult> {
        context?.check();
        const [storageKeys, versions] = await Promise.all([this.dependencies.resumeRepository.listStorageKeys(), context ? this.dependencies.resumeStorage.listVersions('resumes/', context) : this.dependencies.resumeStorage.listVersions('resumes/')]);
        context?.check();
        if (storageKeys.length > 100000 || versions.length > 10000) throw new Error('GC_LIMIT');
        const keys = new Set(storageKeys); const cutoff = new Date(this.now().getTime() - ORPHAN_GRACE_PERIOD_MS);
        const result = { deleted: 0, skipped: 0, candidates: 0, failed: 0 };
        for (const version of versions) {
            if (!version.key.startsWith('resumes/') || keys.has(version.key) || !(version.lastModified < cutoff)) { result.skipped++; continue; }
            result.candidates++;
            try {
                context?.check();
                if (context) await this.dependencies.resumeStorage.deleteVersion(version.key, version.versionId, context);
                else await this.dependencies.resumeStorage.deleteVersion(version.key, version.versionId);
                result.deleted++;
            } catch { result.failed++; if (context?.signal.aborted) break; }
        }
        return result;
    }
}
