import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunDailyJobPipeline } from '@/application/jobs/run-daily-job-pipeline';
import type { MatchingRepository } from '@/application/jobs/ports/matching-repository';
import { CollectionProgressError } from '@/application/jobs/collection-progress-error';
describe('Deadline global do pipeline', () => {
    afterEach(() => vi.useRealTimers());
    it('deadline cancela fonte cooperativa e não inicia nova coleta/matching', async () => {
        vi.useFakeTimers();
        const repository = { listEligibleUsers: vi.fn() } as unknown as MatchingRepository;
        const next = vi.fn();
        const pipeline = new RunDailyJobPipeline({ repository, guard: { run: async (task) => task() }, collectors: [
            { name: 'slow', collect: { execute: async (context) => { await new Promise<void>((resolve) => context!.signal.addEventListener('abort', () => resolve(), { once: true })); context!.check(); throw new Error(); } } },
            { name: 'next', collect: { execute: next } },
        ] });
        const pending = pipeline.execute({ timeoutMs: 100 }); await vi.advanceTimersByTimeAsync(100); const result = await pending;
        expect(result).toMatchObject({ partial: true, timedOut: true, usersProcessed: 0 }); expect(next).not.toHaveBeenCalled(); expect(repository.listEligibleUsers).not.toHaveBeenCalled();
    });
    it('falha após persistir lote mantém contagens sanitizadas', async () => {
        const repository = { listEligibleUsers: async () => ({ users: [] }), clearCheckpoint: vi.fn() } as unknown as MatchingRepository;
        const result = await new RunDailyJobPipeline({ repository, guard: { run: async (task) => task() }, collectors: [{ name: 'fixture', collect: { execute: async () => { throw new CollectionProgressError({ collected: 200, inserted: 80, duplicates: 20, updated: 100, reactivated: 0, deactivated: 0 }); } } }] }).execute();
        expect(result?.sources[0]).toMatchObject({ failed: true, collected: 200, inserted: 80, duplicates: 20, updated: 100 }); expect(result?.partial).toBe(true);
    });
});
