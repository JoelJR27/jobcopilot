import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JobsPage from '@/app/jobs/page';
import JobsLoading from '@/app/jobs/loading';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeGetRecommendedJobs } from '@/infrastructure/composition/recommended-jobs';
import { GetRecommendedJobs } from '@/application/jobs/get-recommended-jobs';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
vi.mock('@/infrastructure/auth/session/require-authenticated-user');
vi.mock('@/infrastructure/composition/recommended-jobs');
describe('Tela real /jobs', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });
    it('sem sessão não consulta dados', async () => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new UnauthorizedError());
        expect(renderToStaticMarkup(await JobsPage())).toContain('Entre na sua conta');
        expect(makeGetRecommendedJobs).not.toHaveBeenCalled();
    });
    it.each(['USER', 'ADMIN'] as const)('%s consulta somente sua identidade e escapa textos', async (role) => {
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({ id: 'a', role, email: 'fixture-pii@example.com' });
        const execute = vi.spyOn(GetRecommendedJobs.prototype, 'execute').mockResolvedValue({ incomplete: false, jobs: [{
            id: 'fixture-match', feedback: null, score: 90, title: '<script>fixture()</script>', company: 'CI&T', source: 'CI&T / Lever', location: 'Brasil', workModel: 'REMOTE', publishedAt: new Date('2026-10-01'),
            url: 'https://jobs.lever.co/ciandt/fixture', matchedCriteria: ['<img src=x onerror=fixture()>'], missingCriteria: ['Senioridade'],
        }] });
        vi.mocked(makeGetRecommendedJobs).mockReturnValue(Object.create(GetRecommendedJobs.prototype) as GetRecommendedJobs);
        const html = renderToStaticMarkup(await JobsPage());
        expect(execute).toHaveBeenCalledWith('a', 1); expect(html).toContain('90/100');
        expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>fixture');
        expect(html).not.toContain('fixture-pii'); expect(html).toContain('noopener noreferrer'); expect(html).toContain('probabilidade de contratação');
    });
    it.each([true, false])('incompleto/vazio tem estado específico', async (incomplete) => {
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({ id: 'a', role: 'USER', email: 'fixture@example.com' });
        vi.spyOn(GetRecommendedJobs.prototype, 'execute').mockResolvedValue({ incomplete, jobs: [] });
        vi.mocked(makeGetRecommendedJobs).mockReturnValue(Object.create(GetRecommendedJobs.prototype) as GetRecommendedJobs);
        expect(renderToStaticMarkup(await JobsPage())).toContain(incomplete ? 'Complete seu' : 'Nenhuma recomendação');
    });
    it('erro genérico e loading', async () => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new Error('fixture-token'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(renderToStaticMarkup(await JobsPage())).not.toContain('fixture-token'); expect(log).toHaveBeenCalledExactlyOnceWith('Erro inesperado ao carregar vagas.');
        expect(renderToStaticMarkup(<JobsLoading />)).toContain('Carregando vagas');
    });
});
