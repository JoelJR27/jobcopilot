import type { JobSourceRepository } from '@/application/jobs/ports/job-source-repository';
import type { PrismaClient } from '@/generated/prisma/client';

export class PrismaJobSourceRepository implements JobSourceRepository {
    private readonly client: PrismaClient;
    constructor(client: PrismaClient) { this.client = client; }

    ensure(source: { name: string; baseUrl: string }) {
        return this.client.jobSource.upsert({
            where: { name: source.name }, create: { name: source.name, baseUrl: source.baseUrl, active: true },
            update: { baseUrl: source.baseUrl }, select: { id: true, active: true },
        });
    }
}
