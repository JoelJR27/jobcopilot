import { describe, expect, it, vi } from 'vitest';
import { RunResumeGc } from '@/application/resume/run-resume-gc';
import { CleanupOrphanedResumes } from '@/application/resume/cleanup-orphaned-resumes';
describe('GC agendado', () => {
    it('falha listagem fica parcial, sem delete ou erro raw', async () => {
        const deleteVersion = vi.fn();
        const result = await new RunResumeGc({ guard: { run: async (task) => task() }, cleanup: new CleanupOrphanedResumes({ resumeRepository: { listStorageKeys: async () => [] }, resumeStorage: { listVersions: async () => { throw new Error('fixture-cookie-body'); }, deleteVersion } }) }).execute();
        expect(result).toMatchObject({ partial: true, deleted: 0, failed: 1 }); expect(deleteVersion).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain('fixture-cookie');
    });
    it('lock GC ocupado não faz manutenção', async () => { const cleanup = { execute: vi.fn() }; expect(await new RunResumeGc({ cleanup, guard: { run: async () => null } }).execute()).toBeNull(); expect(cleanup.execute).not.toHaveBeenCalled(); });
    it('cancelamento cooperativo não exclui versões', async () => { const cleanup = { execute: vi.fn(async () => ({ deleted: 0, skipped: 0, candidates: 0, failed: 0 })) }; const abort = new AbortController(); abort.abort(); const result = await new RunResumeGc({ cleanup, guard: { run: async (task) => task() } }).execute(abort.signal); expect(result).toMatchObject({ partial: true }); expect(cleanup.execute).not.toHaveBeenCalled(); });
});
