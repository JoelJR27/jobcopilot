import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/internal/jobs/run/route';
import { makeDailyJobPipeline } from '@/infrastructure/composition/daily-job-pipeline';
vi.mock('@/infrastructure/composition/daily-job-pipeline');
describe('Cron Vercel', () => {
    afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
    it('GET exige envs coerentes e Bearer, não user-agent/cookie', async () => {
        vi.stubEnv('CRON_SECRET', 's'.repeat(40)); vi.stubEnv('INTERNAL_JOBS_SECRET', 's'.repeat(40));
        const response = await GET(new Request('https://app.example/api/internal/jobs/run', { headers: { 'user-agent': 'vercel-cron/1.0', cookie: 'fixture-only' } }));
        expect(response.status).toBe(401); expect(makeDailyJobPipeline).not.toHaveBeenCalled();
    });
    it('divergência dos secrets falha fechado', async () => {
        vi.stubEnv('CRON_SECRET', 'x'.repeat(40)); vi.stubEnv('INTERNAL_JOBS_SECRET', 's'.repeat(40));
        expect((await GET(new Request('https://app.example/api/internal/jobs/run'))).status).toBe(503);
    });
    it('GET autorizado chama pipeline e não retorna internals', async () => {
        vi.stubEnv('CRON_SECRET', 's'.repeat(40)); vi.stubEnv('INTERNAL_JOBS_SECRET', 's'.repeat(40));
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const execute = vi.fn().mockResolvedValue({ sources: [], usersProcessed: 0, matchesUpserted: 0 });
        vi.mocked(makeDailyJobPipeline).mockReturnValue({ execute, disconnect: vi.fn().mockResolvedValue(undefined) });
        const response = await GET(new Request('https://app.example/api/internal/jobs/run', { headers: { authorization: 'Bearer ' + 's'.repeat(40) } }));
        expect(response.status).toBe(200); expect(await response.json()).toEqual({ message: 'Execução concluída.' }); expect(execute).toHaveBeenCalledOnce();
    });
});
