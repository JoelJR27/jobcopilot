import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT as feedback } from '@/app/api/job-matches/[id]/feedback/route';
import { PUT as source } from '@/app/api/admin/job-sources/[id]/route';
import { GET as operations } from '@/app/api/admin/operations/route';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { requireAdminUser } from '@/infrastructure/auth/session/require-admin-user';
import { makeSaveMatchFeedback } from '@/infrastructure/composition/feedback';
import { makeSetJobSourceActive, makeGetOperations } from '@/infrastructure/composition/admin-operations';
import { SaveMatchFeedback } from '@/application/jobs/save-match-feedback';
import { SetJobSourceActive } from '@/application/admin/set-job-source-active';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { ForbiddenError } from '@/shared/errors/forbidden-error';
vi.mock('@/infrastructure/auth/session/require-authenticated-user');
vi.mock('@/infrastructure/auth/session/require-admin-user');
vi.mock('@/infrastructure/composition/feedback');
vi.mock('@/infrastructure/composition/admin-operations');
const id = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ id }) };
const request = (payload: unknown = { type: 'RELEVANT' }, headers: Record<string, string> = {}) => new Request('https://app.example/api/resource', { method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) });
describe('Feedback e admin autorizados no servidor', () => {
    beforeEach(() => {
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({ id: 'a', email: 'fixture@example.com', role: 'USER' });
        vi.mocked(requireAdminUser).mockResolvedValue({ id: 'admin', email: 'fixture-admin@example.com', role: 'ADMIN' });
    });
    afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });
    it('feedback 401 antes de ler body', async () => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new UnauthorizedError());
        expect((await feedback(request(), context)).status).toBe(401); expect(makeSaveMatchFeedback).not.toHaveBeenCalled();
    });
    it.each(['USER', 'ADMIN'] as const)('%s só usa owner da sessão e upsert tipo permitido', async (role) => {
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({ id: 'a', role, email: 'fixture@example.com' });
        const set = vi.fn().mockResolvedValue(true); vi.mocked(makeSaveMatchFeedback).mockReturnValue(new SaveMatchFeedback({ set }));
        const response = await feedback(request({ type: 'NOT_RELEVANT', userId: 'b', role: 'ADMIN' }), context);
        expect(response.status).toBe(200); expect(set).toHaveBeenCalledWith('a', id, 'NOT_RELEVANT'); expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({ feedback: { type: 'NOT_RELEVANT' } });
    });
    it.each(['USER', 'ADMIN'] as const)('%s não altera match de outro usuário', async () => {
        vi.mocked(makeSaveMatchFeedback).mockReturnValue(new SaveMatchFeedback({ set: async () => false }));
        expect((await feedback(request(), context)).status).toBe(404);
    });
    it.each([{ type: 'INVALID' }, {}, { type: ['RELEVANT'] }])('payload inválido', async (payload) => {
        vi.mocked(makeSaveMatchFeedback).mockReturnValue(new SaveMatchFeedback({ set: vi.fn() }));
        expect((await feedback(request(payload), context)).status).toBe(400);
    });
    it('ID inválido, origem e body gigante são rejeitados', async () => {
        vi.mocked(makeSaveMatchFeedback).mockReturnValue(new SaveMatchFeedback({ set: vi.fn() }));
        expect((await feedback(request(), { params: Promise.resolve({ id: 'invalid' }) })).status).toBe(400);
        expect((await feedback(request({}, { origin: 'https://evil.example' }), context)).status).toBe(403);
        expect((await feedback(request({ extra: 'x'.repeat(66000) }), context)).status).toBe(400);
    });
    it('500 genérico sem exception raw', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(makeSaveMatchFeedback).mockReturnValue(new SaveMatchFeedback({ set: async () => { throw new Error('fixture-pii-token'); } }));
        const response = await feedback(request(), context); expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('fixture-pii'); expect(log).toHaveBeenCalledWith('Falha inesperada ao processar operação.');
    });
    it.each([new UnauthorizedError(), new ForbiddenError()])('admin nega sessão ausente/USER em GET e PUT', async (error) => {
        vi.mocked(requireAdminUser).mockRejectedValue(error);
        expect((await operations()).status).toBe(error instanceof UnauthorizedError ? 401 : 403);
        expect((await source(request({ active: true }), context)).status).toBe(error instanceof UnauthorizedError ? 401 : 403);
        expect(makeGetOperations).not.toHaveBeenCalled(); expect(makeSetJobSourceActive).not.toHaveBeenCalled();
    });
    it('toggle allowlisted ignora identidade/baseUrl e valida boolean', async () => {
        const setSourceActive = vi.fn().mockResolvedValue(true);
        vi.mocked(makeSetJobSourceActive).mockReturnValue(new SetJobSourceActive({ getOverview: vi.fn(), setSourceActive }));
        expect((await source(request({ active: false, baseUrl: 'https://evil.example', userId: 'b' }), context)).status).toBe(200);
        expect(setSourceActive).toHaveBeenCalledExactlyOnceWith(id, false);
        expect((await source(request({ active: 'true' }), context)).status).toBe(400);
    });
});
