import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/generated/prisma/client';
import { PrismaAdminSeedRepository } from '@/infrastructure/database/prisma/repositories/admin-seed-repository';

// Opt-in, somente PostgreSQL local; nunca usa usuários/tabelas reais do app.
describe.skipIf(process.env.JOBCOPILOT_DB_TESTS !== '1')('Roles e seed no PostgreSQL (schema isolado)', () => {
    const schema = `test_auth_roles_${randomUUID().replaceAll('-', '')}`;
    let connection: Client | undefined;
    let client: PrismaClient | undefined;

    beforeAll(async () => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)) {
            throw new Error('O teste de integração exige PostgreSQL local.');
        }

        connection = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
        await connection.connect();
        // Nome gerado internamente, composto somente por letras, underscore e hex.
        await connection.query(`CREATE SCHEMA "${schema}"`);
        await connection.query(`SET search_path TO "${schema}"`);

        for (const name of ['20260907030824_init', '20260910011542_make_resume_one_per_user']) {
            const sql = await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
            await connection.query(sql);
        }

        await connection.query('INSERT INTO "User" (id, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, NOW())', [
            'existing-user', 'existing@example.com', 'test-existing-hash',
        ]);
        const migration = await readFile(new URL('../../prisma/migrations/20261007000000_add_user_role/migration.sql', import.meta.url), 'utf8');
        await connection.query(migration);

        client = new PrismaClient({
            adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 }, { schema }),
            log: [],
        });
    }, 20000);

    afterAll(async () => {
        await client?.$disconnect();
        if (connection) {
            try {
                await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            } finally {
                await connection.end();
            }
        }
    });

    it('migration preserva conta anterior como USER e aplica default USER', async () => {
        expect((await client!.user.findUniqueOrThrow({ where: { id: 'existing-user' } })).role).toBe('USER');
        const created = await client!.user.create({ data: { email: 'normal@example.com', passwordHash: 'test-normal-hash' } });
        expect(created.role).toBe('USER');
    });

    it('seed repetido cria somente um ADMIN sem substituir senha', async () => {
        const seed = new PrismaAdminSeedRepository(client!);
        await seed.upsertAdmin({ email: 'new-admin@example.com', passwordHash: 'test-first-hash' });
        await seed.upsertAdmin({ email: 'new-admin@example.com', passwordHash: 'test-second-hash' });
        const users = await client!.user.findMany({ where: { email: 'new-admin@example.com' } });
        expect(users).toHaveLength(1);
        expect(users[0].role).toBe('ADMIN');
        expect(users[0].passwordHash).toBe('test-first-hash');
    });

    it('promoção revoga somente sessões do promovido e preserva senha e outras contas', async () => {
        const other = await client!.user.create({ data: { email: 'other@example.com', passwordHash: 'test-other-hash' } });
        await client!.session.createMany({ data: [
            { userId: 'existing-user', expiresAt: new Date('2030-01-01') },
            { userId: other.id, expiresAt: new Date('2030-01-01') },
        ] });
        const seed = new PrismaAdminSeedRepository(client!);
        await seed.upsertAdmin({ email: 'existing@example.com', passwordHash: 'test-replacement-hash' });
        const promoted = await client!.user.findUniqueOrThrow({ where: { id: 'existing-user' } });
        expect(promoted.role).toBe('ADMIN');
        expect(promoted.passwordHash).toBe('test-existing-hash');
        expect(await client!.session.count({ where: { userId: promoted.id } })).toBe(0);
        expect(await client!.session.count({ where: { userId: other.id } })).toBe(1);
        expect((await client!.user.findUniqueOrThrow({ where: { id: other.id } })).role).toBe('USER');

        await client!.session.create({ data: { userId: promoted.id, expiresAt: new Date('2030-01-01') } });
        await seed.upsertAdmin({ email: promoted.email, passwordHash: 'test-another-hash' });
        expect(await client!.session.count({ where: { userId: promoted.id } })).toBe(1);
    });

    it('seed concorrente não duplica conta nem regrava sua senha', async () => {
        const seed = new PrismaAdminSeedRepository(client!);
        await Promise.all([
            seed.upsertAdmin({ email: 'concurrent@example.com', passwordHash: 'test-concurrent-a' }),
            seed.upsertAdmin({ email: 'concurrent@example.com', passwordHash: 'test-concurrent-b' }),
        ]);
        const users = await client!.user.findMany({ where: { email: 'concurrent@example.com' } });
        expect(users).toHaveLength(1);
        expect(users[0].role).toBe('ADMIN');
        expect(['test-concurrent-a', 'test-concurrent-b']).toContain(users[0].passwordHash);
    });
});
