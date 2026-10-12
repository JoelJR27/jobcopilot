import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/jobs/route';
import { POST } from '@/app/api/internal/jobs/run/route';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeGetRecommendedJobs } from '@/infrastructure/composition/recommended-jobs';
import { makeDailyJobPipeline } from '@/infrastructure/composition/daily-job-pipeline';
import { GetRecommendedJobs } from '@/application/jobs/get-recommended-jobs';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
vi.mock('@/infrastructure/auth/session/require-authenticated-user');
vi.mock('@/infrastructure/composition/recommended-jobs');
vi.mock('@/infrastructure/composition/daily-job-pipeline');
describe('APIs de vagas e cron', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
    it('401 sem sessão, no-store e sem consulta', async () => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new UnauthorizedError());
        const response = await GET(new Request('https://app.example/api/jobs'));
        expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('no-store');
        expect(makeGetRecommendedJobs).not.toHaveBeenCalled();
    });
    it.each(['USER', 'ADMIN'] as const)('%s ignora userId/role e usa seus próprios matches', async (role) => {
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({ id: 'a', role, email: 'fixture@example.com' });
        const execute = vi.spyOn(GetRecommendedJobs.prototype, 'execute').mockResolvedValue({ incomplete: false, jobs: [] });
        vi.mocked(makeGetRecommendedJobs).mockReturnValue(Object.create(GetRecommendedJobs.prototype) as GetRecommendedJobs);
        const response = await GET(new Request('https://app.example/api/jobs?userId=b&role=ADMIN&page=2'));
        expect(response.status).toBe(200); expect(execute).toHaveBeenCalledExactlyOnceWith('a', 2);
        expect(response.headers.get('cache-control')).toBe('no-store'); expect(await response.json()).toEqual({ incomplete: false, jobs: [] });
    });
    it('500 genérico e logs sem PII/exceptions', async () => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new Error('fixture-private-cookie'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const response = await GET(new Request('https://app.example/api/jobs'));
        expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain('fixture-private');
        expect(log).toHaveBeenCalledExactlyOnceWith('Erro inesperado ao listar vagas.');
    });
    it.each(['USER', 'ADMIN'] as const)('sessão %s não autoriza pipeline', async () => {
        vi.stubEnv('INTERNAL_JOBS_SECRET', 's'.repeat(40));
        expect((await POST(new Request('https://app.example/api/internal/jobs/run', { method: 'POST', headers: { Cookie: 'fixture-only' } }))).status).toBe(401);
        expect(makeDailyJobPipeline).not.toHaveBeenCalled();
    });
    it('secret ausente falha fechado e query não é aceita como autenticação', async () => {
        vi.stubEnv('INTERNAL_JOBS_SECRET', '');
        expect((await POST(new Request('https://app.example/api/internal/jobs/run', { method: 'POST' }))).status).toBe(503);
        vi.stubEnv('INTERNAL_JOBS_SECRET', 's'.repeat(40));
        expect((await POST(new Request('https://app.example/api/internal/jobs/run?secret=fixture', { method: 'POST', headers: { Authorization: 'Bearer ' + 's'.repeat(40) } }))).status).toBe(401);
    });
    it('token certo executa, não retorna contagens internas e limita replay local', async () => {
        vi.stubEnv('INTERNAL_JOBS_SECRET', 's'.repeat(40));
        const execute = vi.fn().mockResolvedValue({ sources: [], usersProcessed: 2, matchesUpserted: 10 });
        vi.mocked(makeDailyJobPipeline).mockReturnValue({ execute, disconnect: vi.fn().mockResolvedValue(undefined) });
        const request = () => new Request('https://app.example/api/internal/jobs/run', { method: 'POST', headers: { Authorization: 'Bearer ' + 's'.repeat(40) } });
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const response = await POST(request()); expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ message: 'Execução concluída.' });
        for (let i = 0; i < 4; i++) expect((await POST(request())).status).toBe(200);
        expect((await POST(request())).status).toBe(429); expect(execute).toHaveBeenCalledTimes(5);
    });
});
