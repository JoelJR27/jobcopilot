import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
export async function backendTestDatabase() {
    const url = process.env.DATABASE_URL;
    if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Exige banco local.');
    const schema = 'test_backend_' + randomUUID().replaceAll('-', '');
    const connection = new Client({ connectionString: url, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    await connection.connect();
    try {
        await connection.query('CREATE SCHEMA "' + schema + '"');
        await connection.query('SET search_path TO "' + schema + '"');
        for (const name of ['20260907030824_init', '20260910011542_make_resume_one_per_user', '20261007000000_add_user_role', '20261007010000_job_match_geography', '20261007020000_backend_readiness']) {
            await connection.query(await readFile(new URL('../../prisma/migrations/' + name + '/migration.sql', import.meta.url), 'utf8'));
        }
        const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2, statement_timeout: 5000 }, { schema }), log: [] });
        return { client, schema, async close() { await client.$disconnect(); try { await connection.query('DROP SCHEMA "' + schema + '" CASCADE'); } finally { await connection.end(); } } };
    } catch { try { await connection.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE'); } finally { await connection.end(); } throw new Error('Falha no banco isolado.'); }
}
