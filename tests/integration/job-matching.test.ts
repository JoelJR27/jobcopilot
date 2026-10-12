import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMatchingRepository } from '@/infrastructure/database/prisma/repositories/matching-repository';
import { PostgresPipelineGuard } from '@/infrastructure/jobs/postgres-pipeline-guard';
import { profileFixture, preferencesFixture } from '@/tests/fixtures/professional-data';
describe.skipIf(process.env.JOBCOPILOT_DB_TESTS !== '1')('Matching PostgreSQL isolado', () => {
    const schema = 'test_matching_' + randomUUID().replaceAll('-', '');
    let connection: Client; let client: PrismaClient; let repo: PrismaMatchingRepository;
    let a: string; let b: string; let admin: string; let jobId: string;
    beforeAll(async () => {
        const url = process.env.DATABASE_URL;
        if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Exige banco local.');
        connection = new Client({ connectionString: url, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
        await connection.connect(); await connection.query('CREATE SCHEMA "' + schema + '"'); await connection.query('SET search_path TO "' + schema + '"');
        for (const name of ['20260907030824_init', '20260910011542_make_resume_one_per_user', '20261007000000_add_user_role', '20261007010000_job_match_geography', '20261007020000_backend_readiness']) await connection.query(await readFile(new URL('../../prisma/migrations/' + name + '/migration.sql', import.meta.url), 'utf8'));
        client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }, { schema }), log: [] }); repo = new PrismaMatchingRepository(client);
        const users = await Promise.all(['a', 'b', 'admin'].map((name) => client.user.create({ data: { email: name + '@example.com', passwordHash: 'synthetic-hash', role: name === 'admin' ? 'ADMIN' : 'USER', profile: { create: profileFixture }, preference: { create: preferencesFixture } } })));
        [a, b, admin] = users.map((user) => user.id);
        const source = await client.jobSource.create({ data: { name: 'CI&T fixture', baseUrl: 'https://jobs.lever.co/ciandt' } });
        jobId = (await client.job.create({ data: { sourceId: source.id, externalId: 'fixture', url: 'https://jobs.lever.co/ciandt/fixture', normalizedUrl: 'https://jobs.lever.co/ciandt/fixture', title: 'Developer', company: 'CI&T', description: 'TypeScript', location: 'Brasil', workModel: 'REMOTE', publishedAt: new Date() } })).id;
    }, 20000);
    afterAll(async () => {
        await client?.$disconnect();
        if (connection) { try { await connection.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE'); } finally { await connection.end(); } }
    });
    it('seleciona USER e ADMIN elegíveis sem dados internos extras', async () => {
        const batch = await repo.listEligibleUsers();
        expect(batch.users.map((user) => user.userId).sort()).toEqual([a, b, admin].sort());
        expect(JSON.stringify(batch)).not.toContain('synthetic-hash'); expect(JSON.stringify(batch)).not.toContain('@example.com');
    });
    it('replay não duplica; A e ADMIN não leem nem alteram B', async () => {
        await repo.upsert(b, jobId, { score: 70, geographyRank: 1, matchedCriteria: ['Critério B'], missingCriteria: [] });
        for (const userId of [a, admin]) {
            await repo.upsert(userId, jobId, { score: 90, geographyRank: 1, matchedCriteria: ['Critério próprio'], missingCriteria: [] });
            await repo.upsert(userId, jobId, { score: 80, geographyRank: 1, matchedCriteria: ['Atualizado'], missingCriteria: [] });
            const rows = await repo.listForUser(userId, 1); expect(rows).toHaveLength(1); expect(rows[0].matchedCriteria).toEqual(['Atualizado']);
            expect(rows[0]).not.toHaveProperty('userId'); expect(rows[0]).toHaveProperty('id'); expect(rows[0]).not.toHaveProperty('jobId');
        }
        expect((await repo.listForUser(b, 1))[0].score).toBe(70);
        expect(await client.jobMatch.count()).toBe(3);
        await repo.removeIneligible(a, jobId);
        expect(await client.jobMatch.count({ where: { userId: b } })).toBe(1);
    });
    it('ordena geografia antes de score e data; exclui fonte inativa', async () => {
        const sourceId = (await client.job.findUniqueOrThrow({ where: { id: jobId } })).sourceId;
        const local = await client.job.create({ data: { sourceId, externalId: 'local', url: 'https://jobs.lever.co/ciandt/local', normalizedUrl: 'https://jobs.lever.co/ciandt/local', title: 'Local', company: 'CI&T', description: '', location: 'Brasil', workModel: 'ONSITE' } });
        await repo.upsert(b, local.id, { score: 20, geographyRank: 0, matchedCriteria: [], missingCriteria: [] });
        expect((await repo.listForUser(b, 1)).map((row) => row.score)).toEqual([20, 70]);
        await client.jobSource.update({ where: { id: sourceId }, data: { active: false } });
        expect(await repo.listForUser(b, 1)).toEqual([]);
    });
    it('advisory lock compartilhado bloqueia concorrência e é liberado', async () => {
        const guard = new PostgresPipelineGuard(process.env.DATABASE_URL!);
        let release!: () => void; let acquired!: () => void;
        const started = new Promise<void>((resolve) => { acquired = resolve; });
        const waiting = guard.run(async () => { acquired(); await new Promise<void>((resolve) => { release = resolve; }); return 'first'; });
        await started; expect(await guard.run(async () => 'second')).toBeNull();
        release(); expect(await waiting).toBe('first'); expect(await guard.run(async () => 'third')).toBe('third');
    });
});
