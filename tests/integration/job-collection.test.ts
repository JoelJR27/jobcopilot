import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaJobRepository } from '@/infrastructure/database/prisma/repositories/job-repository';
import { PrismaJobSourceRepository } from '@/infrastructure/database/prisma/repositories/job-source-repository';
import { CollectJobs } from '@/application/jobs/collect-jobs';
import { normalizeJob } from '@/domain/jobs/normalize-job';
import { collectedJobFixture } from '@/tests/fixtures/collected-jobs';

describe.skipIf(process.env.JOBCOPILOT_DB_TESTS !== '1')('Coleta PostgreSQL isolada', () => {
    const schema = `test_jobs_${randomUUID().replaceAll('-', '')}`;
    let connection: Client | undefined;
    let client: PrismaClient | undefined;
    let jobs: PrismaJobRepository;
    let sources: PrismaJobSourceRepository;
    let sourceA: string;
    let sourceB: string;

    beforeAll(async () => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)) throw new Error('O teste exige PostgreSQL local.');
        connection = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
        await connection.connect();
        await connection.query(`CREATE SCHEMA "${schema}"`);
        await connection.query(`SET search_path TO "${schema}"`);
        for (const name of ['20260907030824_init', '20260910011542_make_resume_one_per_user', '20261007000000_add_user_role', '20261007010000_job_match_geography', '20261007020000_backend_readiness']) {
            await connection.query(await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8'));
        }
        client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 }, { schema }), log: [] });
        jobs = new PrismaJobRepository(client);
        sources = new PrismaJobSourceRepository(client);
        sourceA = (await sources.ensure({ name: 'Fixture A', baseUrl: 'https://jobs.example.com' })).id;
        sourceB = (await sources.ensure({ name: 'Fixture B', baseUrl: 'https://other.example.com' })).id;
    }, 20000);
    afterAll(async () => {
        await client?.$disconnect();
        if (connection) {
            try { await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await connection.end(); }
        }
    });

    it('dedupe por externalId funciona mesmo quando URL muda', async () => {
        const first = normalizeJob({ ...collectedJobFixture, externalId: 'ext-case', url: 'https://jobs.example.com/ext-one' });
        expect(await jobs.insertOrIgnore(sourceA, [first])).toBe(1);
        expect(await jobs.insertOrIgnore(sourceA, [{ ...first, url: 'https://jobs.example.com/ext-two', normalizedUrl: 'https://jobs.example.com/ext-two' }])).toBe(0);
        expect(await client!.job.count({ where: { sourceId: sourceA, externalId: 'ext-case' } })).toBe(1);
    });
    it('sem externalId, dedupe por normalizedUrl e NULL não bloqueia outras URLs', async () => {
        const first = normalizeJob({ ...collectedJobFixture, externalId: undefined, url: 'https://jobs.example.com/url-case?utm_source=one#apply' });
        const duplicate = normalizeJob({ ...collectedJobFixture, externalId: undefined, url: 'https://jobs.example.com/url-case?utm_source=two#other' });
        expect(await jobs.insertOrIgnore(sourceA, [first])).toBe(1);
        expect(await jobs.insertOrIgnore(sourceA, [duplicate])).toBe(0);
        expect(await jobs.insertOrIgnore(sourceA, [normalizeJob({ ...collectedJobFixture, externalId: undefined, url: 'https://jobs.example.com/another-url' })])).toBe(1);
    });
    it('constraint de URL também protege conflito entre IDs externos diferentes', async () => {
        const first = normalizeJob({ ...collectedJobFixture, externalId: 'first-id', url: 'https://jobs.example.com/identity-conflict' });
        expect(await jobs.insertOrIgnore(sourceA, [first])).toBe(1);
        expect(await jobs.insertOrIgnore(sourceA, [{ ...first, externalId: 'second-id' }])).toBe(0);
    });
    it('duas fontes sintéticas não colidem pelo mesmo externalId/URL', async () => {
        const job = normalizeJob({ ...collectedJobFixture, externalId: 'shared-id', url: 'https://jobs.example.com/shared' });
        expect(await jobs.insertOrIgnore(sourceA, [job])).toBe(1);
        expect(await jobs.insertOrIgnore(sourceB, [job])).toBe(1);
        expect(await client!.job.count({ where: { externalId: 'shared-id' } })).toBe(2);
    });
    it('execução repetida idempotente conta duplicadas e coleta vazia não exclui', async () => {
        const useCase = new CollectJobs({ repository: jobs, sourceRepository: sources, source: { name: 'Arbeitnow Fixture', baseUrl: 'https://www.arbeitnow.com' },
            collector: { collect: async () => [collectedJobFixture] } });
        expect(await useCase.execute()).toMatchObject({ collected: 1, inserted: 1, duplicates: 0, skippedInactive: false });
        expect(await useCase.execute()).toMatchObject({ collected: 1, inserted: 0, duplicates: 1, skippedInactive: false });
        const before = await client!.job.count();
        await new CollectJobs({ repository: jobs, sourceRepository: sources, source: { name: 'Arbeitnow Fixture', baseUrl: 'https://www.arbeitnow.com' }, collector: { collect: async () => [] } }).execute();
        expect(await client!.job.count()).toBe(before);
    });
    it('execução concorrente permanece protegida pelas constraints', async () => {
        const job = normalizeJob({ ...collectedJobFixture, externalId: 'concurrent', url: 'https://jobs.example.com/concurrent' });
        const counts = await Promise.all([jobs.insertOrIgnore(sourceA, [job]), jobs.insertOrIgnore(sourceA, [job])]);
        expect(counts.reduce((sum, value) => sum + value, 0)).toBe(1);
        expect(await client!.job.count({ where: { sourceId: sourceA, externalId: 'concurrent' } })).toBe(1);
    });
    it('remoção da fonte não faz cascade-delete de jobs', async () => {
        const before = await client!.job.count({ where: { sourceId: sourceA } });
        await expect(client!.jobSource.delete({ where: { id: sourceA } })).rejects.toMatchObject({ code: 'P2003' });
        expect(await client!.job.count({ where: { sourceId: sourceA } })).toBe(before);
    });
    it('fonte inativa permanece inativa após ensure', async () => {
        await client!.jobSource.update({ where: { id: sourceB }, data: { active: false } });
        expect((await sources.ensure({ name: 'Fixture B', baseUrl: 'https://other.example.com' })).active).toBe(false);
    });
    it('descrição com script permanece dado no banco, sem execução', async () => {
        const description = '<script>globalThis.jobFixtureExecuted=true</script> descrição';
        await jobs.insertOrIgnore(sourceA, [normalizeJob({ ...collectedJobFixture, externalId: 'untrusted-html', url: 'https://jobs.example.com/untrusted-html', description })]);
        const stored = await client!.job.findUniqueOrThrow({ where: { sourceId_externalId: { sourceId: sourceA, externalId: 'untrusted-html' } } });
        expect(stored.description).toBe(description);
        expect('jobFixtureExecuted' in globalThis).toBe(false);
    });
});
