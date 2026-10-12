import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetCurrentUser } from '@/application/auth/get-current-user';
import type { UserRepository } from '@/application/auth/ports/user-repository';
import type { SessionManager } from '@/application/auth/ports/session-manager';
import type { UserRole } from '@/domain/auth/user-role';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { requireAdminUser } from '@/infrastructure/auth/session/require-admin-user';
import { getSessionId } from '@/infrastructure/auth/session/session-cookie';
import { makeGetCurrentUser } from '@/infrastructure/composition/auth';
import { GET } from '@/app/api/auth/me/route';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { ForbiddenError } from '@/shared/errors/forbidden-error';

vi.mock('@/infrastructure/auth/session/session-cookie');
vi.mock('@/infrastructure/composition/auth');

describe('Autorização USER/ADMIN pela sessão', () => {
    const users = new Map<string, { id: string; email: string; role: UserRole }>();
    let repository: UserRepository;
    let sessions: SessionManager;

    beforeEach(() => {
        vi.resetAllMocks();
        users.clear();
        users.set('user-a', { id: 'user-a', email: 'a@example.com', role: 'USER' });
        users.set('admin-b', { id: 'admin-b', email: 'b@example.com', role: 'ADMIN' });
        repository = {
            findById: vi.fn(async (id) => users.get(id) ?? null),
            findByEmail: vi.fn(),
            create: vi.fn(),
        };
        sessions = {
            create: vi.fn(),
            destroy: vi.fn(),
            validate: vi.fn(async (id: string) => {
                const identities: Record<string, string> = { 'test-session-a': 'user-a', 'test-session-b': 'admin-b' };
                const userId = identities[id];
                return userId ? { userId, expiresAt: new Date('2030-01-01') } : null;
            }),
        };
        vi.mocked(makeGetCurrentUser).mockReturnValue(new GetCurrentUser(sessions, repository));
        vi.mocked(getSessionId).mockResolvedValue('test-session-a');
    });

    it.each([
        ['USER', 'test-session-a', 'user-a'],
        ['ADMIN', 'test-session-b', 'admin-b'],
    ])('%s usa o mesmo fluxo autenticado', async (role, sessionId, id) => {
        vi.mocked(getSessionId).mockResolvedValue(sessionId);
        expect(await requireAuthenticatedUser()).toEqual({ id, email: users.get(id)!.email, role });
    });

    it('USER recebe ForbiddenError (403) ao exigir admin', async () => {
        await expect(requireAdminUser()).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('ADMIN é autorizado no servidor', async () => {
        vi.mocked(getSessionId).mockResolvedValue('test-session-b');
        expect((await requireAdminUser()).id).toBe('admin-b');
    });

    it.each([null, 'invalid-test-session'])('sem sessão válida recebe UnauthorizedError (401): %s', async (sessionId) => {
        vi.mocked(getSessionId).mockResolvedValue(sessionId);
        await expect(requireAdminUser()).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('falha fechado para role desconhecida', async () => {
        const user = users.get('user-a')!;
        Object.assign(user, { role: 'SUPERUSER' });
        await expect(requireAdminUser()).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('relê role do banco e rejeita ADMIN removido', async () => {
        vi.mocked(getSessionId).mockResolvedValue('test-session-b');
        await requireAdminUser();
        users.get('admin-b')!.role = 'USER';
        await expect(requireAdminUser()).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('usuário excluído não é autorizado', async () => {
        users.delete('user-a');
        await expect(requireAdminUser()).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('falha do banco não concede autorização', async () => {
        vi.mocked(repository.findById).mockRejectedValue(new Error('test-database-failure'));
        await expect(requireAdminUser()).rejects.toThrow('test-database-failure');
    });

    it('sessão A não retorna usuário B nem seus privilégios', async () => {
        expect(await requireAuthenticatedUser()).toEqual(users.get('user-a'));
        expect(repository.findById).toHaveBeenCalledExactlyOnceWith('user-a');
        await expect(requireAdminUser()).rejects.toBeInstanceOf(ForbiddenError);
    });

    it.each(['test-session-a', 'test-session-b'])('/me retorna apenas os campos públicos da sessão %s', async (sessionId) => {
        vi.mocked(getSessionId).mockResolvedValue(sessionId);
        const response = await GET();
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        const expected = sessionId === 'test-session-a' ? users.get('user-a') : users.get('admin-b');
        expect(await response.json()).toEqual({ user: expected });
    });

    it('/me não vaza erro interno ou dados sensíveis no log', async () => {
        vi.mocked(repository.findById).mockRejectedValue(new Error('sensitive-test-detail'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const response = await GET();
            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({ message: 'Ocorreu um erro ao verificar a autenticação.' });
            expect(log).toHaveBeenCalledExactlyOnceWith('Erro inesperado ao verificar a autenticação.');
        } finally {
            log.mockRestore();
        }
    });
});
