import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaFeedbackRepository } from '@/infrastructure/database/prisma/repositories/feedback-repository';
import { PrismaMatchingRepository } from '@/infrastructure/database/prisma/repositories/matching-repository';
import { PrismaOperationsRepository } from '@/infrastructure/database/prisma/repositories/operations-repository';
import { PrismaJobRepository } from '@/infrastructure/database/prisma/repositories/job-repository';
import { normalizeJob } from '@/domain/jobs/normalize-job';
describe.skipIf(process.env.JOBCOPILOT_DB_TESTS !== '1')('Feedback/fontes/admin PostgreSQL isolado', () => {
    const schema = 'test_phase6_' + randomUUID().replaceAll('-', '');
    let connection: Client; let client: PrismaClient; let feedback: PrismaFeedbackRepository; let matching: PrismaMatchingRepository; let ops: PrismaOperationsRepository;
    let a: string; let b: string; let admin: string; let jobId: string; let matchId: string; let sourceId: string;
    beforeAll(async () => {
        const url = process.env.DATABASE_URL;
        if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Exige banco local.');
        connection = new Client({ connectionString: url, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
        await connection.connect(); await connection.query('CREATE SCHEMA "' + schema + '"'); await connection.query('SET search_path TO "' + schema + '"');
        for (const name of ['20260907030824_init', '20260910011542_make_resume_one_per_user', '20261007000000_add_user_role', '20261007010000_job_match_geography', '20261007020000_backend_readiness']) await connection.query(await readFile(new URL('../../prisma/migrations/' + name + '/migration.sql', import.meta.url), 'utf8'));
        client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }, { schema }), log: [] });
        feedback = new PrismaFeedbackRepository(client); matching = new PrismaMatchingRepository(client); ops = new PrismaOperationsRepository(client);
        const users = await Promise.all(['a', 'b', 'admin'].map((name) => client.user.create({ data: { email: name + '@example.com', passwordHash: 'synthetic-hash', role: name === 'admin' ? 'ADMIN' : 'USER' } })));
        [a, b, admin] = users.map((user) => user.id);
        const source = await client.jobSource.create({ data: { name: 'Swile / Lever', baseUrl: 'https://jobs.lever.co/swile' } }); sourceId = source.id;
        jobId = (await client.job.create({ data: { sourceId, externalId: 'feedback-fixture', url: 'https://jobs.lever.co/swile/fixture', normalizedUrl: 'https://jobs.lever.co/swile/fixture', title: 'Engineer', company: 'Swile', description: 'TypeScript', location: 'Brasil', workModel: 'REMOTE' } })).id;
        await matching.upsert(b, jobId, { score: 80, geographyRank: 1, matchedCriteria: ['Brasil'], missingCriteria: [] });
        matchId = (await client.jobMatch.findUniqueOrThrow({ where: { userId_jobId: { userId: b, jobId } } })).id;
    }, 20000);
    afterAll(async () => {
        await client?.$disconnect();
        if (connection) { try { await connection.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE'); } finally { await connection.end(); } }
    });
    it('feedback create/update/replay não duplica', async () => {
        expect(await feedback.set(b, matchId, 'RELEVANT')).toBe(true);
        expect(await feedback.set(b, matchId, 'NOT_RELEVANT')).toBe(true);
        expect(await feedback.set(b, matchId, 'NOT_RELEVANT')).toBe(true);
        expect(await client.matchFeedback.count()).toBe(1);
    });
    it('A e ADMIN não leem/alteram feedback/match de B', async () => {
        for (const userId of [a, admin]) {
            expect(await feedback.set(userId, matchId, 'RELEVANT')).toBe(false);
            expect(await matching.listForUser(userId, 1)).toEqual([]);
        }
        expect((await client.matchFeedback.findUniqueOrThrow({ where: { jobMatchId: matchId } })).type).toBe('NOT_RELEVANT');
    });
    it('ocultar inelegível preserva feedback e reativação reutiliza o match', async () => {
        await matching.removeIneligible(b, jobId);
        expect(await matching.listForUser(b, 1)).toEqual([]);
        expect(await client.matchFeedback.count()).toBe(1); expect(await client.jobMatch.count()).toBe(1);
        await matching.upsert(b, jobId, { score: 90, geographyRank: 1, matchedCriteria: [], missingCriteria: [] });
        const rows = await matching.listForUser(b, 1); expect(rows[0].id).toBe(matchId); expect(rows[0].feedback).toBe('NOT_RELEVANT');
    });
    it('feedback concorrente mantém uma row e owner', async () => {
        expect(await Promise.all([feedback.set(b, matchId, 'RELEVANT'), feedback.set(b, matchId, 'NOT_RELEVANT')])).toEqual([true, true]);
        expect(await client.matchFeedback.count()).toBe(1);
    });
    it('toggle idempotente oculta sem apagar jobs/matches/feedback', async () => {
        expect(await ops.setSourceActive(sourceId, false)).toBe(true); await ops.setSourceActive(sourceId, false);
        expect(await matching.listForUser(b, 1)).toEqual([]);
        expect(await client.job.count()).toBe(1); expect(await client.matchFeedback.count()).toBe(1);
        const overview = await ops.getOverview(); expect(overview.users).toBe(3); expect(overview.sources[0].active).toBe(false);
        expect(JSON.stringify(overview)).not.toContain('@example.com'); expect(JSON.stringify(overview)).not.toContain('synthetic-hash');
        await ops.setSourceActive(sourceId, true);
    });
    it('CI&T e Swile não colidem por externalId/normalizedUrl e replay ignora', async () => {
        const ciandt = await client.jobSource.create({ data: { name: 'CI&T / Lever', baseUrl: 'https://jobs.lever.co/ciandt' } });
        const jobs = new PrismaJobRepository(client);
        const value = normalizeJob({ externalId: 'same-id', url: 'https://jobs.lever.co/swile/shared-fixture', title: 'Engineer', company: 'Fixture', description: 'TypeScript', location: 'Brasil' });
        expect(await jobs.insertOrIgnore(sourceId, [value])).toBe(1);
        expect(await jobs.insertOrIgnore(ciandt.id, [value])).toBe(1);
        expect(await jobs.insertOrIgnore(sourceId, [value])).toBe(0);
        expect(await jobs.insertOrIgnore(ciandt.id, [value])).toBe(0);
        expect(await client.job.count({ where: { externalId: 'same-id' } })).toBe(2);
    });
});
