import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as jobs } from '@/app/api/internal/jobs/run/route';
import { GET as gc } from '@/app/api/internal/resumes/gc/route';
import { makeDailyJobPipeline } from '@/infrastructure/composition/daily-job-pipeline';
import { makeRunResumeGc } from '@/infrastructure/composition/resume-gc';
vi.mock('@/infrastructure/composition/daily-job-pipeline');
vi.mock('@/infrastructure/composition/resume-gc');
describe('Contratos operacionais dos crons', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
    const configure = () => { vi.stubEnv('CRON_SECRET', 'synthetic-cron-only-'.repeat(3)); vi.stubEnv('INTERNAL_JOBS_SECRET', process.env.CRON_SECRET!); vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); };
    const request = (path: string) => new Request('https://app.example/api/internal/' + path, { headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET } });
    it('jobs responde 409 ocupado, 503 parcial/falha e nunca expõe internals', async () => {
        configure();
        const execute = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ partial: true, sources: [], durationMs: 10 }).mockRejectedValueOnce(new Error('synthetic-cookie-password'));
        vi.mocked(makeDailyJobPipeline).mockReturnValue({ execute, disconnect: vi.fn().mockResolvedValue(undefined) });
        for (const status of [409, 503, 503]) { const response = await jobs(request('jobs/run')); expect(response.status).toBe(status); expect(response.headers.get('cache-control')).toBe('no-store'); expect(Object.keys(await response.json())).toEqual(['message']); }
        expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('synthetic-cookie-password');
    });
    it('GC responde 409 ocupado, 503 parcial e 200 replay; logs não incluem bearer', async () => {
        configure();
        const execute = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ partial: true, candidates: 1, deleted: 0, failed: 1, skipped: 0, durationMs: 10 }).mockResolvedValueOnce({ partial: false, candidates: 0, deleted: 0, failed: 0, skipped: 1, durationMs: 2 });
        vi.mocked(makeRunResumeGc).mockReturnValue({ execute } as unknown as ReturnType<typeof makeRunResumeGc>);
        for (const status of [409, 503, 200]) { const response = await gc(request('resumes/gc')); expect(response.status).toBe(status); expect(response.headers.get('cache-control')).toBe('no-store'); expect(Object.keys(await response.json())).toEqual(['message']); }
        expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(process.env.CRON_SECRET);
    });
    it('GC recusa query/cookie e secrets divergentes sem instanciar manutenção', async () => {
        configure(); vi.mocked(makeRunResumeGc).mockClear();
        expect((await gc(request('resumes/gc?secret=fixture'))).status).toBe(401);
        expect((await gc(new Request('https://app.example/api/internal/resumes/gc', { headers: { cookie: 'synthetic-only', 'user-agent': 'vercel-cron/1.0' } }))).status).toBe(401);
        vi.stubEnv('CRON_SECRET', 'different-test-only-'.repeat(3)); expect((await gc(request('resumes/gc'))).status).toBe(503);
        expect(makeRunResumeGc).not.toHaveBeenCalled();
    });
});
