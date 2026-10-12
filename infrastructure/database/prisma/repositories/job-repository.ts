import type { JobRepository } from '@/application/jobs/ports/job-repository';
import type { NormalizedJob } from '@/domain/jobs/collected-job';
import type { PrismaClient } from '@/generated/prisma/client';
import type { ExecutionContext } from '@/application/operations/execution-context';

export class PrismaJobRepository implements JobRepository {
    private readonly client: PrismaClient;
    constructor(client: PrismaClient) { this.client = client; }

    async insertOrIgnore(sourceId: string, jobs: NormalizedJob[], context?: ExecutionContext) {
        context?.check();
        const result = await this.client.job.createMany({
            data: jobs.map((job) => ({ sourceId, externalId: job.externalId ?? null, url: job.url,
                normalizedUrl: job.normalizedUrl, title: job.title, company: job.company, description: job.description,
                location: job.location ?? null, workModel: job.workModel ?? null, publishedAt: job.publishedAt ?? null })),
            skipDuplicates: true,
        });
        return result.count;
    }
    async observe(sourceId: string, jobs: NormalizedJob[], context?: ExecutionContext) {
        let updated = 0; let reactivated = 0;
        for (const job of jobs) {
            context?.check();
            const where = job.externalId ? { sourceId, OR: [{ externalId: job.externalId }, { normalizedUrl: job.normalizedUrl }] } : { sourceId, normalizedUrl: job.normalizedUrl };
            const rows = await this.client.job.findMany({ where, take: 2, select: { id: true, active: true, externalId: true } });
            // Identidades ambíguas nunca sobrescrevem duas vagas nem seus históricos.
            if (rows.length !== 1) throw new Error('JOB_IDENTITY_CONFLICT');
            const row = rows[0];
            await this.client.job.update({ where: { id: row.id }, data: { title: job.title, company: job.company, description: job.description,
                url: job.url, normalizedUrl: job.normalizedUrl, externalId: job.externalId ?? row.externalId,
                location: job.location ?? null, workModel: job.workModel ?? null, publishedAt: job.publishedAt ?? null, lastSeenAt: new Date(), active: true } });
            updated++; if (!row.active) reactivated++;
        }
        return { updated, reactivated };
    }
    async expire(sourceId: string, context?: ExecutionContext) {
        context?.check();
        return (await this.client.job.updateMany({ where: { sourceId, active: true, lastSeenAt: { lt: new Date(Date.now() - 14 * 86400000) } }, data: { active: false } })).count;
    }
}
