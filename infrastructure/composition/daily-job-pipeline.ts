import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { CollectJobs } from '../../application/jobs/collect-jobs.ts';
import { RunDailyJobPipeline } from '../../application/jobs/run-daily-job-pipeline.ts';
import { PrismaJobRepository } from '../database/prisma/repositories/job-repository.ts';
import { PrismaJobSourceRepository } from '../database/prisma/repositories/job-source-repository.ts';
import { PrismaMatchingRepository } from '../database/prisma/repositories/matching-repository.ts';
import { PostgresPipelineGuard } from '../jobs/postgres-pipeline-guard.ts';
import { LeverJobCollector } from '../jobs/lever-job-collector.ts';
import { ArbeitnowJobCollector } from '../jobs/arbeitnow-job-collector.ts';
import { CIANDT_SOURCE, SWILE_SOURCE, ARBEITNOW_SOURCE } from '../../shared/config/job-source.ts';
import { databaseOptions, getDirectDatabaseUrl } from '../../shared/config/database-env.ts';
export function makeDailyJobPipeline(connectionString: string) {
    const client = new PrismaClient({ adapter: new PrismaPg(databaseOptions(connectionString)), log: [] });
    const sources = [{ source: CIANDT_SOURCE, collector: new LeverJobCollector('ciandt') }, { source: SWILE_SOURCE, collector: new LeverJobCollector('swile') }, { source: ARBEITNOW_SOURCE, collector: new ArbeitnowJobCollector() }];
    const pipeline = new RunDailyJobPipeline({ repository: new PrismaMatchingRepository(client), guard: new PostgresPipelineGuard(getDirectDatabaseUrl(connectionString)),
        collectors: sources.map(({ source, collector }) => ({ name: source.name, collect: new CollectJobs({ source, collector, repository: new PrismaJobRepository(client), sourceRepository: new PrismaJobSourceRepository(client) }) })) });
    return { execute: (options?: { timeoutMs?: number; signal?: AbortSignal }) => pipeline.execute(options), disconnect: () => client.$disconnect() };
}
