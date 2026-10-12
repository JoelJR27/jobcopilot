import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { PrismaProfileRepository } from '@/infrastructure/database/prisma/repositories/profile-repository';
import { PrismaPreferenceRepository } from '@/infrastructure/database/prisma/repositories/preference-repository';
import { profileFixture, preferencesFixture } from '@/tests/fixtures/professional-data';

describe.each([
    { kind: 'profile', fixture: profileFixture, create: (client: PrismaClient) => new PrismaProfileRepository(client) },
    { kind: 'preference', fixture: preferencesFixture, create: (client: PrismaClient) => new PrismaPreferenceRepository(client) },
])('Prisma $kind repository', ({ kind, fixture, create }) => {
    function setup() {
        const model = { findUnique: vi.fn(), upsert: vi.fn(async () => fixture) };
        const client = { [kind]: model } as unknown as PrismaClient;
        return { model, repository: create(client) };
    }

    it('GET inexistente é null e consulta somente userId confiável', async () => {
        const { repository, model } = setup();
        model.findUnique.mockResolvedValue(null);
        expect(await repository.findByUserId('user-a')).toBeNull();
        const args = model.findUnique.mock.calls[0][0];
        expect(args.where).toEqual({ userId: 'user-a' });
        expect(Object.keys(args.select).sort()).toEqual(Object.keys(fixture).sort());
    });

    it('upsert mapeia somente campos permitidos e fixa owner no create/where', async () => {
        const { repository, model } = setup();
        const unsafe = { ...profileFixture, ...preferencesFixture, userId: 'user-b', id: 'other', role: 'ADMIN', passwordHash: 'private-fixture' };
        await repository.upsert('user-a', unsafe);
        expect(model.upsert).toHaveBeenCalledExactlyOnceWith({
            where: { userId: 'user-a' }, create: { userId: 'user-a', ...fixture }, update: fixture,
            select: Object.fromEntries(Object.keys(fixture).map((key) => [key, true])),
        });
    });

    it('dados inválidos persistidos geram erro controlável, sem retornar objeto raw', async () => {
        const { repository, model } = setup();
        model.findUnique.mockResolvedValue({ arbitrary: 'private-fixture' });
        await expect(repository.findByUserId('user-a')).rejects.toThrow('Os dados persistidos');
    });
});
