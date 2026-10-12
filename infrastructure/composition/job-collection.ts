import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { CollectJobs } from '../../application/jobs/collect-jobs.ts';
import { ArbeitnowJobCollector } from '../jobs/arbeitnow-job-collector.ts';
import { PrismaJobRepository } from '../database/prisma/repositories/job-repository.ts';
import { PrismaJobSourceRepository } from '../database/prisma/repositories/job-source-repository.ts';
import { ARBEITNOW_SOURCE } from '../../shared/config/job-source.ts';

export function makeJobCollection(connectionString: string) {
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 15000 }), log: [] });
    const useCase = new CollectJobs({ collector: new ArbeitnowJobCollector(), repository: new PrismaJobRepository(client),
        sourceRepository: new PrismaJobSourceRepository(client), source: ARBEITNOW_SOURCE });
    return { execute: () => useCase.execute(), disconnect: () => client.$disconnect() };
}
