import { describe, expect, it, vi } from 'vitest';
import { RunDailyJobPipeline } from '@/application/jobs/run-daily-job-pipeline';
import { GetRecommendedJobs } from '@/application/jobs/get-recommended-jobs';
import type { MatchingRepository } from '@/application/jobs/ports/matching-repository';
import { profileFixture, preferencesFixture } from '@/tests/fixtures/professional-data';
const repository = (): MatchingRepository => ({
    listEligibleUsers: vi.fn().mockImplementation(async (after) => after ? { users: [] } : { users: ['a', 'b'].map((userId) => ({ userId, profile: profileFixture, preferences: preferencesFixture })) }),
    listJobs: vi.fn().mockImplementation(async (after) => after ? [] : [{ id: 'br', title: 'Pessoa desenvolvedora Pleno', description: 'TypeScript', location: 'Brasil', workModel: 'REMOTE' }, { id: 'foreign', title: 'Developer', description: '', location: 'Germany', workModel: 'REMOTE' }]),
    upsert: vi.fn(), removeIneligible: vi.fn(), listForUser: vi.fn().mockResolvedValue([]),
});
describe('Pipeline diário', () => {
    it('falha Swile não aborta CI&T/Arbeitnow nem matching', async () => {
        const ciandt = vi.fn().mockResolvedValue({ collected: 1, inserted: 0, duplicates: 1, skippedInactive: false });
        const swile = vi.fn().mockRejectedValue(new Error('fixture-body-token'));
        const arbeitnow = vi.fn().mockResolvedValue({ collected: 1, inserted: 0, duplicates: 1, skippedInactive: false });
        const repo = repository();
        const result = await new RunDailyJobPipeline({ repository: repo, guard: { run: (task) => task() }, collectors: [{ name: 'CI&T', collect: { execute: ciandt } }, { name: 'Swile', collect: { execute: swile } }, { name: 'Arbeitnow', collect: { execute: arbeitnow } }] }).execute();
        expect(ciandt).toHaveBeenCalledOnce(); expect(arbeitnow).toHaveBeenCalledOnce();
        expect(result?.sources[1].failed).toBe(true); expect(result?.matchesUpserted).toBe(2);
        expect(JSON.stringify(result)).not.toContain('fixture-body-token');
    });
    it('processa usuários independentes; replay usa upsert e erros de fonte não bloqueiam fallback', async () => {
        const repo = repository(); const pipeline = new RunDailyJobPipeline({ repository: repo, guard: { run: (task) => task() }, collectors: [
            { name: 'Brazil', collect: { execute: vi.fn().mockRejectedValue(new Error('fixture-token-body')) } },
            { name: 'Fallback', collect: { execute: vi.fn().mockResolvedValue({ collected: 1, inserted: 1, duplicates: 0, skippedInactive: false }) } },
        ] });
        const first = await pipeline.execute(); await pipeline.execute();
        expect(first).toMatchObject({ usersProcessed: 2, matchesUpserted: 2 });
        expect(JSON.stringify(first)).not.toContain('fixture-token-body');
        expect(repo.upsert).toHaveBeenCalledWith('a', 'br', expect.objectContaining({ score: 100 }));
        expect(repo.upsert).toHaveBeenCalledWith('b', 'br', expect.objectContaining({ score: 100 }));
        expect(repo.removeIneligible).toHaveBeenCalledWith('a', 'foreign');
        expect(repo.upsert).toHaveBeenCalledTimes(4);
    });
    it('lock ocupado não coleta', async () => {
        const execute = vi.fn(); expect(await new RunDailyJobPipeline({ repository: repository(), collectors: [{ name: 'source', collect: { execute } }], guard: { run: async () => null } }).execute()).toBeNull();
        expect(execute).not.toHaveBeenCalled();
    });
    it('lista pessoal só usa a identidade autenticada fornecida pelo adapter', async () => {
        const repo = repository();
        const useCase = new GetRecommendedJobs({ repository: repo, profiles: { findByUserId: async () => profileFixture, upsert: vi.fn() }, preferences: { findByUserId: async () => preferencesFixture, upsert: vi.fn() } });
        await useCase.execute('a'); expect(repo.listForUser).toHaveBeenCalledWith('a', 1);
        await useCase.execute('b'); expect(repo.listForUser).toHaveBeenCalledWith('b', 1);
    });
    it('incompleto não consulta matches', async () => {
        const repo = repository();
        expect(await new GetRecommendedJobs({ repository: repo, profiles: { findByUserId: async () => null, upsert: vi.fn() }, preferences: { findByUserId: async () => null, upsert: vi.fn() } }).execute('a')).toEqual({ incomplete: true, jobs: [] });
        expect(repo.listForUser).not.toHaveBeenCalled();
    });
});
