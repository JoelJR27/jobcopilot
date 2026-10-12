import { describe, expect, it, vi } from 'vitest';

import { LoginUser } from '@/application/auth/login-user';
import { RegisterUser } from '@/application/auth/register-user';
import type { UserRepository } from '@/application/auth/ports/user-repository';
import type { SessionManager } from '@/application/auth/ports/session-manager';
import type { PasswordHasher } from '@/application/auth/ports/password-hasher';
import type { UserRole } from '@/domain/auth/user-role';
import { registerSchema } from '@/features/auth/schemas/register-schema';
import { AuthenticationError } from '@/shared/errors/authentication-error';

function makeDependencies(role: UserRole = 'USER') {
    const repository: UserRepository = {
        findByEmail: vi.fn(async () => ({ id: 'user-a', email: 'a@example.com', role, passwordHash: 'test-hash-placeholder' })),
        findById: vi.fn(),
        create: vi.fn(async (input) => ({ id: 'created', email: input.email, role: 'USER' as const })),
    };
    const passwordHasher: PasswordHasher = {
        hash: vi.fn(async () => 'test-hash-placeholder'),
        compare: vi.fn(async () => true),
    };
    const sessionManager: SessionManager = {
        create: vi.fn(async () => ({ sessionId: 'test-session', expiresAt: new Date('2030-01-01') })),
        validate: vi.fn(),
        destroy: vi.fn(),
    };
    return { repository, passwordHasher, sessionManager };
}

describe('Roles nos casos de uso de autenticação', () => {
    it.each<UserRole>(['USER', 'ADMIN'])('login de %s retorna role sem hash', async (role) => {
        const { repository, passwordHasher, sessionManager } = makeDependencies(role);
        const login = new LoginUser(repository, passwordHasher, sessionManager);
        const result = await login.execute({ email: ' A@EXAMPLE.COM ', password: 'test-input' });
        expect(result.user).toEqual({ id: 'user-a', email: 'a@example.com', role });
        expect(repository.findByEmail).toHaveBeenCalledWith('a@example.com');
        expect(sessionManager.create).toHaveBeenCalledExactlyOnceWith('user-a');
    });

    it('role, userId e passwordHash do cadastro não entram na persistência', async () => {
        const { repository, passwordHasher } = makeDependencies();
        vi.mocked(repository.findByEmail).mockResolvedValue(null);
        const input = registerSchema.parse({
            email: 'a@example.com', password: 'FixtureOnly9!', role: 'ADMIN', userId: 'user-b', passwordHash: 'attacker-test-value',
        });
        const result = await new RegisterUser(repository, passwordHasher).execute(input);
        expect(result.role).toBe('USER');
        expect(repository.create).toHaveBeenCalledExactlyOnceWith({ email: 'a@example.com', passwordHash: 'test-hash-placeholder' });
    });

    it('senha incorreta nunca cria sessão mesmo para ADMIN', async () => {
        const { repository, passwordHasher, sessionManager } = makeDependencies('ADMIN');
        vi.mocked(passwordHasher.compare).mockResolvedValue(false);
        await expect(new LoginUser(repository, passwordHasher, sessionManager).execute({ email: 'a@example.com', password: 'wrong-test-input' }))
            .rejects.toBeInstanceOf(AuthenticationError);
        expect(sessionManager.create).not.toHaveBeenCalled();
    });
});
