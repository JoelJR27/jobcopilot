import { describe, expect, it, vi } from 'vitest';

import { CleanupOrphanedResumes } from '@/application/resume/cleanup-orphaned-resumes';

describe('CleanupOrphanedResumes', () => {
    it('deve excluir versões órfãs com mais de 24 horas', async () => {
        const now = new Date('2026-09-09T12:00:00.000Z');

        const resumeRepository = {
            listStorageKeys: vi.fn().mockResolvedValue([
                'resumes/user-1/current.pdf',
            ]),
        };

        const resumeStorage = {
            listVersions: vi.fn().mockResolvedValue([
                {
                    key: 'resumes/user-1/current.pdf',
                    versionId: 'version-current',
                    isDeleteMarker: false,
                    lastModified: new Date(
                        '2026-09-08T10:00:00.000Z',
                    ),
                },
                {
                    key: 'resumes/user-2/orphan.pdf',
                    versionId: 'version-orphan',
                    isDeleteMarker: false,
                    lastModified: new Date(
                        '2026-09-08T10:00:00.000Z',
                    ),
                },
            ]),
            deleteVersion: vi.fn().mockResolvedValue(undefined),
        };

        const cleanup = new CleanupOrphanedResumes({
            resumeRepository,
            resumeStorage,
            now: () => now,
        });

        const result = await cleanup.execute();

        expect(resumeStorage.deleteVersion).toHaveBeenCalledTimes(1);

        expect(resumeStorage.deleteVersion).toHaveBeenCalledWith(
            'resumes/user-2/orphan.pdf',
            'version-orphan',
        );

        expect(result).toEqual({
            deleted: 1,
            skipped: 1,
        });
    });

    it('não deve excluir uma versão órfã com menos de 24 horas', async () => {
        const now = new Date('2026-09-09T12:00:00.000Z');

        const resumeRepository = {
            listStorageKeys: vi.fn().mockResolvedValue([]),
        };

        const resumeStorage = {
            listVersions: vi.fn().mockResolvedValue([
                {
                    key: 'resumes/user-1/recent.pdf',
                    versionId: 'version-recent',
                    isDeleteMarker: false,
                    lastModified: new Date(
                        '2026-09-08T13:00:00.000Z',
                    ),
                },
            ]),
            deleteVersion: vi.fn().mockResolvedValue(undefined),
        };

        const cleanup = new CleanupOrphanedResumes({
            resumeRepository,
            resumeStorage,
            now: () => now,
        });

        const result = await cleanup.execute();

        expect(resumeStorage.deleteVersion).not.toHaveBeenCalled();

        expect(result).toEqual({
            deleted: 0,
            skipped: 1,
        });
    });

    it('deve excluir delete markers órfãos antigos', async () => {
        const now = new Date('2026-09-09T12:00:00.000Z');

        const resumeRepository = {
            listStorageKeys: vi.fn().mockResolvedValue([]),
        };

        const resumeStorage = {
            listVersions: vi.fn().mockResolvedValue([
                {
                    key: 'resumes/user-1/orphan.pdf',
                    versionId: 'delete-marker-1',
                    isDeleteMarker: true,
                    lastModified: new Date(
                        '2026-09-08T10:00:00.000Z',
                    ),
                },
            ]),
            deleteVersion: vi.fn().mockResolvedValue(undefined),
        };

        const cleanup = new CleanupOrphanedResumes({
            resumeRepository,
            resumeStorage,
            now: () => now,
        });

        await cleanup.execute();

        expect(resumeStorage.deleteVersion).toHaveBeenCalledWith(
            'resumes/user-1/orphan.pdf',
            'delete-marker-1',
        );
    });
});