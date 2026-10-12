import type { PrismaClient } from '@/generated/prisma/client';
import type { OperationsRepository } from '@/application/admin/ports/operations-repository';
export class PrismaOperationsRepository implements OperationsRepository {
    constructor(private readonly client: PrismaClient) {}
    async getOverview() {
        const [users, jobs, matches, feedbacks, sources] = await Promise.all([
            this.client.user.count(), this.client.job.count(), this.client.jobMatch.count(), this.client.matchFeedback.count(),
            this.client.jobSource.findMany({ orderBy: { name: 'asc' }, take: 100, select: { id: true, name: true, active: true } }),
        ]);
        return { users, jobs, matches, feedbacks, sources };
    }
    async setSourceActive(id: string, active: boolean) { return (await this.client.jobSource.updateMany({ where: { id }, data: { active } })).count === 1; }
}
