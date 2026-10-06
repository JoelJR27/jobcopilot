import type { ResumeMaintenanceRepository } from './ports/resume-maintenance-repository';
import type { ResumeStorageMaintenance } from './ports/resume-storage-maintenance';

const ORPHAN_GRACE_PERIOD_MS = 1000 * 60 * 60 * 24;
const RESUMES_PREFIX = 'resumes/';

export interface CleanupOrphanedResumesResult {
    deleted: number;
    skipped: number;
}

export interface CleanupOrphanedResumesDependencies {
    resumeRepository: ResumeMaintenanceRepository;
    resumeStorage: ResumeStorageMaintenance;
    now?: () => Date;
}

export class CleanupOrphanedResumes {
    private readonly now: () => Date;

    constructor(
        private readonly dependencies: CleanupOrphanedResumesDependencies,
    ) {
        this.now = dependencies.now ?? (() => new Date());
    }

    async execute(): Promise<CleanupOrphanedResumesResult> {
        const [storageKeys, versions] = await Promise.all([
            this.dependencies.resumeRepository.listStorageKeys(),
            this.dependencies.resumeStorage.listVersions(RESUMES_PREFIX),
        ]);

        const currentStorageKeys = new Set(storageKeys);

        const cutoff = new Date(
            this.now().getTime() - ORPHAN_GRACE_PERIOD_MS,
        );

        let deleted = 0;
        let skipped = 0;

        for (const version of versions) {
            const isReferencedByDatabase = currentStorageKeys.has(
                version.key,
            );

            const isOldEnough = version.lastModified < cutoff;

            if (isReferencedByDatabase || !isOldEnough) {
                skipped++;
                continue;
            }

            await this.dependencies.resumeStorage.deleteVersion(
                version.key,
                version.versionId,
            );

            deleted++;
        }

        return {
            deleted,
            skipped,
        };
    }
}