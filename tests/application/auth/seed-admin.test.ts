import { describe, expect, it, vi } from 'vitest';

import { seedAdmin } from '@/application/auth/seed-admin';
import { parseSeedAdminEnv } from '@/shared/config/seed-admin-env';
import { BcryptPasswordHasher } from '@/infrastructure/auth/password/bcrypt-password-hasher';
import type { AdminSeedRepository } from '@/application/auth/ports/admin-seed-repository';

const input = { SEED_ADMIN_EMAIL: ' Admin@Example.com ', SEED_ADMIN_PASSWORD: 'FixtureOnly9!' };

describe('SeedAdmin', () => {
    it('valida, normaliza e passa somente hash ao port de persistência', async () => {
        const repository = { upsertAdmin: vi.fn<AdminSeedRepository['upsertAdmin']>(async () => {}) };
        const passwordHasher = new BcryptPasswordHasher();
        await seedAdmin(input, { repository, passwordHasher });
        const saved = repository.upsertAdmin.mock.calls[0][0];
        expect(saved.email).toBe('admin@example.com');
        expect(saved.passwordHash).not.toBe(input.SEED_ADMIN_PASSWORD);
        expect(await passwordHasher.compare(input.SEED_ADMIN_PASSWORD, saved.passwordHash)).toBe(true);
        expect(Object.keys(saved).sort()).toEqual(['email', 'passwordHash']);
    });

    it.each([
        {},
        { ...input, SEED_ADMIN_EMAIL: 'invalid' },
        { ...input, SEED_ADMIN_EMAIL: 'a'.repeat(255) + '@example.com' },
        { ...input, SEED_ADMIN_PASSWORD: '' },
        { ...input, SEED_ADMIN_PASSWORD: 'short' },
        { ...input, SEED_ADMIN_PASSWORD: 'lowercase9!' },
        { ...input, SEED_ADMIN_PASSWORD: 'NoNumbers!' },
        { ...input, SEED_ADMIN_PASSWORD: 'NoSymbols9' },
        { ...input, SEED_ADMIN_PASSWORD: 'A9!' + 'a'.repeat(70) },
        { ...input, SEED_ADMIN_PASSWORD: 'A9!' + 'á'.repeat(35) },
    ])('rejeita configuração inválida sem persistir', async (settings) => {
        const repository = { upsertAdmin: vi.fn(async () => {}) };
        const passwordHasher = { hash: vi.fn(async () => 'test-hash'), compare: vi.fn() };
        await expect(seedAdmin(settings, { repository, passwordHasher })).rejects.toThrow('Configure SEED_ADMIN_EMAIL');
        expect(passwordHasher.hash).not.toHaveBeenCalled();
        expect(repository.upsertAdmin).not.toHaveBeenCalled();
    });

    it('erro de validação não contém valores de entrada', () => {
        const invalid = 'sensitive-fixture-marker';
        try {
            parseSeedAdminEnv({ SEED_ADMIN_EMAIL: invalid, SEED_ADMIN_PASSWORD: invalid });
            expect.fail('Deveria rejeitar configuração inválida.');
        } catch (error) {
            expect(String(error)).not.toContain(invalid);
        }
    });
});
