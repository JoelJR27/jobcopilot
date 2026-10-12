import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as login } from '@/app/api/auth/login/route';
import { POST as register } from '@/app/api/auth/register/route';
import { LoginUser } from '@/application/auth/login-user';
import { RegisterUser } from '@/application/auth/register-user';
import type { UserRepository } from '@/application/auth/ports/user-repository';
import type { UserRole } from '@/domain/auth/user-role';
import { makeLoginUser, makeRegisterUser } from '@/infrastructure/composition/auth';
import { setSessionCookie } from '@/infrastructure/auth/session/session-cookie';

vi.mock('@/infrastructure/composition/auth');
vi.mock('@/infrastructure/auth/session/session-cookie');

function request(payload: unknown) {
    return new Request('http://localhost:3000/api/auth', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
}

describe('Role e minimização nas respostas HTTP de auth', () => {
    let repository: UserRepository;

    beforeEach(() => {
        vi.resetAllMocks();
        repository = {
            findById: vi.fn(),
            findByEmail: vi.fn(async () => null),
            create: vi.fn(async (data) => ({ id: 'user-a', email: data.email, role: 'USER' as const })),
        };
        const hasher = { hash: vi.fn(async () => 'test-hash'), compare: vi.fn(async () => true) };
        vi.mocked(makeRegisterUser).mockReturnValue(new RegisterUser(repository, hasher));
        vi.mocked(makeLoginUser).mockReturnValue(new LoginUser(repository, hasher, {
            create: vi.fn(async () => ({ sessionId: 'test-session-only', expiresAt: new Date('2030-01-01') })),
            validate: vi.fn(), destroy: vi.fn(),
        }));
    });

    afterEach(() => vi.restoreAllMocks());

    it('cadastro ignora role ADMIN e identidade enviadas pelo cliente', async () => {
        const response = await register(request({ email: 'a@example.com', password: 'FixtureOnly9!', role: 'ADMIN', userId: 'other-user' }));
        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ message: 'Solicitação de cadastro recebida. Tente entrar com suas credenciais.' });
        expect(repository.create).toHaveBeenCalledExactlyOnceWith({ email: 'a@example.com', passwordHash: 'test-hash' });
    });

    it.each<UserRole>(['USER', 'ADMIN'])('login %s retorna role do banco, sem hash ou sessão no JSON', async (role) => {
        vi.mocked(repository.findByEmail).mockResolvedValue({ id: 'user-a', email: 'a@example.com', role, passwordHash: 'test-hash' });
        const response = await login(request({ email: 'a@example.com', password: 'FixtureOnly9!', role: 'ADMIN', userId: 'other-user' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ user: { id: 'user-a', email: 'a@example.com', role } });
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(setSessionCookie).toHaveBeenCalledOnce();
    });

    it.each([login, register])('JSON malformado retorna 400 sem invocar casos de uso', async (handler) => {
        const response = await handler(new Request('http://localhost:3000/api/auth', { method: 'POST', body: '{invalid' }));
        expect(response.status).toBe(400);
        expect(makeLoginUser).not.toHaveBeenCalled();
        expect(makeRegisterUser).not.toHaveBeenCalled();
    });

    it('cadastro existente retorna a mesma resposta pública', async () => {
        vi.mocked(repository.findByEmail).mockResolvedValue({ id: 'user-a', email: 'a@example.com', role: 'ADMIN', passwordHash: 'test-hash' });
        const response = await register(request({ email: 'a@example.com', password: 'FixtureOnly9!' }));
        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ message: 'Solicitação de cadastro recebida. Tente entrar com suas credenciais.' });
    });

    it.each([login, register])('falha inesperada é genérica e não vaza detalhes no log', async (handler) => {
        vi.mocked(repository.findByEmail).mockRejectedValue(new Error('sensitive-fixture-error'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const response = await handler(request({ email: 'a@example.com', password: 'FixtureOnly9!' }));
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('sensitive-fixture-error');
        expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive-fixture-error');
    });
});
