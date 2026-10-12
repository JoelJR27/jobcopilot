import type { PrismaClient } from '@/generated/prisma/client';
import type { MatchingRepository, RecommendedJob } from '@/application/jobs/ports/matching-repository';
import type { MatchResult } from '@/domain/jobs/match-job';
import { profileSchema } from '../../../../domain/profile/profile.ts';
import { preferencesSchema } from '../../../../domain/preferences/preferences.ts';
import { normalizeJobUrl } from '../../../../domain/jobs/normalize-job.ts';
import { brazilEligibility } from '../../../../domain/jobs/brazil-eligibility.ts';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../../generated/prisma/client.ts';
export class PrismaMatchingRepository implements MatchingRepository {
    private readonly client: PrismaClient;
    private readonly table: Prisma.Sql;
    constructor(client: PrismaClient, schema = 'public') {
        if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('INVALID_DATABASE_SCHEMA');
        this.client = client;
        // Identificador exclusivamente de configuração interna, nunca de HTTP.
        this.table = Prisma.raw('"' + schema + '"."JobMatch"');
    }
    loadCheckpoint() { return this.client.jobPipelineState.findUnique({ where: { id: 'daily_jobs' }, select: { userCursor: true, jobCursor: true } }); }
    async saveCheckpoint(cursor: { userCursor: string | null; jobCursor: string | null }) { await this.client.jobPipelineState.upsert({ where: { id: 'daily_jobs' }, create: { id: 'daily_jobs', ...cursor }, update: cursor }); }
    async clearCheckpoint() { await this.client.jobPipelineState.deleteMany({ where: { id: 'daily_jobs' } }); }
    async persistBatch(userId: string, values: { jobId: string; result: MatchResult | null }[], cursor: { userCursor: string | null; jobCursor: string | null }) {
        if (values.length > 100) throw new Error('BATCH_LIMIT');
        const data = values.flatMap((value) => value.result ? [{ id: randomUUID(), userId, jobId: value.jobId, ...value.result }] : []);
        return this.client.$transaction(async (tx) => {
            // SQL fixo, JSON parametrizado; bulk upsert necessário para limitar roundtrips em serverless.
            const rows = data.length ? await tx.$queryRaw<{ created: boolean }[]>`INSERT INTO ${this.table} ("id", "userId", "jobId", "score", "geographyRank", "matchedCriteria", "missingCriteria", "createdAt", "updatedAt")
              SELECT b.id, b."userId", b."jobId", b.score, b."geographyRank", b."matchedCriteria", b."missingCriteria", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
              FROM jsonb_to_recordset(${JSON.stringify(data)}::jsonb) AS b(id text, "userId" text, "jobId" text, score double precision, "geographyRank" integer, "matchedCriteria" jsonb, "missingCriteria" jsonb)
              ON CONFLICT ("userId", "jobId") DO UPDATE SET "score"=EXCLUDED."score", "geographyRank"=EXCLUDED."geographyRank", "matchedCriteria"=EXCLUDED."matchedCriteria", "missingCriteria"=EXCLUDED."missingCriteria", "updatedAt"=CURRENT_TIMESTAMP
              RETURNING (xmax = 0) AS created` : [];
            await tx.jobMatch.updateMany({ where: { userId, jobId: { in: values.filter((value) => !value.result).map((value) => value.jobId) } }, data: { geographyRank: 3 } });
            await tx.jobPipelineState.upsert({ where: { id: 'daily_jobs' }, create: { id: 'daily_jobs', ...cursor }, update: cursor });
            return { created: rows.filter((row) => row.created).length, updated: rows.filter((row) => !row.created).length };
        }, { maxWait: 3000, timeout: 5000 });
    }
    async listEligibleUsers(after?: string, includeAfter = false) {
        const rows = await this.client.user.findMany({ where: { profile: { isNot: null }, preference: { isNot: null }, ...(after ? { id: includeAfter ? { gte: after } : { gt: after } } : {}) },
            orderBy: { id: 'asc' }, take: 50, select: { id: true, profile: { select: { headline: true, summary: true, skills: true, experiences: true, education: true, languages: true, roles: true, seniority: true } },
                preference: { select: { desiredRoles: true, desiredSkills: true, seniority: true, workModels: true, locations: true } } } });
        const users = rows.flatMap((row) => {
            const profile = profileSchema.safeParse(row.profile); const preferences = preferencesSchema.safeParse(row.preference);
            return profile.success && preferences.success ? [{ userId: row.id, profile: profile.data, preferences: preferences.data }] : [];
        });
        return { users, next: rows.length === 50 ? rows[rows.length - 1].id : undefined };
    }
    listJobs(after?: string) {
        return this.client.job.findMany({ where: { active: true, lastSeenAt: { gte: new Date(Date.now() - 30 * 86400000) }, source: { active: true }, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: 'asc' }, take: 100,
            select: { id: true, title: true, description: true, location: true, workModel: true } });
    }
    async upsert(userId: string, jobId: string, result: MatchResult) {
        const data = { score: result.score, geographyRank: result.geographyRank, matchedCriteria: result.matchedCriteria, missingCriteria: result.missingCriteria };
        await this.client.jobMatch.upsert({ where: { userId_jobId: { userId, jobId } }, create: { userId, jobId, ...data }, update: data });
    }
    async removeIneligible(userId: string, jobId: string) { await this.client.jobMatch.updateMany({ where: { userId, jobId }, data: { geographyRank: 3 } }); }
    async listForUser(userId: string, page: number): Promise<RecommendedJob[]> {
        const rows = await this.client.jobMatch.findMany({ where: { userId, geographyRank: { lt: 3 }, job: { active: true, lastSeenAt: { gte: new Date(Date.now() - 30 * 86400000) }, source: { active: true } } },
            orderBy: [{ geographyRank: 'asc' }, { score: 'desc' }, { job: { publishedAt: { sort: 'desc', nulls: 'last' } } }, { id: 'asc' }],
            skip: (page - 1) * 20, take: 20, select: { id: true, feedback: { select: { type: true, userId: true } }, score: true, matchedCriteria: true, missingCriteria: true,
                job: { select: { title: true, company: true, location: true, workModel: true, url: true, publishedAt: true, source: { select: { name: true } } } } } });
        return rows.flatMap((row) => {
            if (!brazilEligibility(row.job).eligible) return [];
            try { normalizeJobUrl(row.job.url); } catch { return []; }
            const reasons = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length <= 6000).slice(0, 20) : [];
            return [{ id: row.id, feedback: row.feedback?.userId === userId ? row.feedback.type : null, score: row.score, matchedCriteria: reasons(row.matchedCriteria), missingCriteria: reasons(row.missingCriteria),
                title: row.job.title, company: row.job.company, location: row.job.location, workModel: row.job.workModel,
                source: row.job.source.name, url: row.job.url, publishedAt: row.job.publishedAt }];
        });
    }
}
