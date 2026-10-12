import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminPage from '@/app/admin/page';
import { FeedbackControls } from '@/features/jobs/feedback-controls';
import { requireAdminUser } from '@/infrastructure/auth/session/require-admin-user';
import { makeGetOperations } from '@/infrastructure/composition/admin-operations';
import { GetOperations } from '@/application/admin/get-operations';
import { ForbiddenError } from '@/shared/errors/forbidden-error';
vi.mock('@/infrastructure/auth/session/require-admin-user');
vi.mock('@/infrastructure/composition/admin-operations');
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
describe('Admin mínimo e controles de feedback', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });
    it('USER não recebe métricas nem controles', async () => {
        vi.mocked(requireAdminUser).mockRejectedValue(new ForbiddenError());
        expect(renderToStaticMarkup(await AdminPage())).toContain('Acesso não permitido');
        expect(makeGetOperations).not.toHaveBeenCalled();
    });
    it('ADMIN recebe só métricas/fontes e mantém link para jobs normal', async () => {
        vi.mocked(requireAdminUser).mockResolvedValue({ id: 'admin', role: 'ADMIN', email: 'fixture-pii@example.com' });
        vi.mocked(makeGetOperations).mockReturnValue(new GetOperations({ getOverview: async () => ({ users: 3, jobs: 29, matches: 4, feedbacks: 2, sources: [{ id: 'fixture-id', name: '<script>fixture()</script>', active: true }] }), setSourceActive: vi.fn() }));
        const html = renderToStaticMarkup(await AdminPage());
        expect(html).toContain('href="/jobs"'); expect(html).toContain('Desativar'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('fixture-pii');
    });
    it('feedback mostra os dois tipos e estado inicial', () => {
        const html = renderToStaticMarkup(<FeedbackControls matchId="fixture" initial="RELEVANT" />);
        expect(html).toContain('Relevante'); expect(html).toContain('Não relevante'); expect(html).toContain('aria-pressed="true"');
    });
});
