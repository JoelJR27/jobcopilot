import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaProfileRepository } from '@/infrastructure/database/prisma/repositories/profile-repository';
import { PrismaPreferenceRepository } from '@/infrastructure/database/prisma/repositories/preference-repository';
import { profileFixture, preferencesFixture } from '@/tests/fixtures/professional-data';

describe.skipIf(process.env.JOBCOPILOT_DB_TESTS !== '1')('Profile/Preferences PostgreSQL isolado', () => {
    const schema = `test_professional_${randomUUID().replaceAll('-', '')}`;
    let connection: Client | undefined;
    let client: PrismaClient | undefined;

    beforeAll(async () => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)) {
            throw new Error('O teste exige PostgreSQL local.');
        }
        connection = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
        await connection.connect();
        await connection.query(`CREATE SCHEMA "${schema}"`);
        await connection.query(`SET search_path TO "${schema}"`);
        for (const name of ['20260907030824_init', '20260910011542_make_resume_one_per_user', '20261007000000_add_user_role', '20261007010000_job_match_geography', '20261007020000_backend_readiness']) {
            await connection.query(await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8'));
        }
        client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 }, { schema }), log: [] });
        await client.user.createMany({ data: [
            { id: 'user-a', email: 'a@example.com', passwordHash: 'test-placeholder' },
            { id: 'user-b', email: 'b@example.com', passwordHash: 'test-placeholder' },
            { id: 'admin-c', email: 'c@example.com', passwordHash: 'test-placeholder', role: 'ADMIN' },
        ] });
    }, 20000);
    afterAll(async () => {
        await client?.$disconnect();
        if (connection) {
            try { await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await connection.end(); }
        }
    });

    it('Profile upsert repetido/concorrente mantém owner e não altera B', async () => {
        const repository = new PrismaProfileRepository(client!);
        expect(await repository.findByUserId('user-a')).toBeNull();
        await repository.upsert('user-b', profileFixture);
        await Promise.all([repository.upsert('user-a', profileFixture), repository.upsert('user-a', profileFixture)]);
        const updated = { ...profileFixture, headline: 'Novo título' };
        await repository.upsert('user-a', updated);
        expect(await repository.findByUserId('user-a')).toEqual(updated);
        expect(await repository.findByUserId('user-b')).toEqual(profileFixture);
        expect(await client!.profile.count({ where: { userId: 'user-a' } })).toBe(1);
    });

    it('Preference upsert repetido/concorrente mantém owner e JSON dos modelos', async () => {
        const repository = new PrismaPreferenceRepository(client!);
        expect(await repository.findByUserId('user-a')).toBeNull();
        await repository.upsert('user-b', preferencesFixture);
        await Promise.all([repository.upsert('user-a', preferencesFixture), repository.upsert('user-a', preferencesFixture)]);
        const updated = { ...preferencesFixture, desiredRoles: ['Novo cargo'] };
        await repository.upsert('user-a', updated);
        expect(await repository.findByUserId('user-a')).toEqual(updated);
        expect(await repository.findByUserId('user-b')).toEqual(preferencesFixture);
        expect(await client!.preference.count({ where: { userId: 'user-a' } })).toBe(1);
    });

    it('ADMIN mantém Profile/Preference próprios e não modifica registros de USER', async () => {
        const profiles = new PrismaProfileRepository(client!);
        const preferences = new PrismaPreferenceRepository(client!);
        await profiles.upsert('admin-c', profileFixture);
        await preferences.upsert('admin-c', preferencesFixture);
        expect(await profiles.findByUserId('admin-c')).toEqual(profileFixture);
        expect(await preferences.findByUserId('admin-c')).toEqual(preferencesFixture);
        expect(await profiles.findByUserId('user-b')).toEqual(profileFixture);
        expect(await preferences.findByUserId('user-b')).toEqual(preferencesFixture);
    });
});
