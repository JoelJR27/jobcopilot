import type { PrismaClient } from '@/generated/prisma/client';
import type { FeedbackRepository } from '@/application/jobs/ports/feedback-repository';
import type { FeedbackType } from '@/domain/jobs/feedback';
export class PrismaFeedbackRepository implements FeedbackRepository {
    constructor(private readonly client: PrismaClient) {}
    async set(userId: string, jobMatchId: string, type: FeedbackType) {
        return this.client.$transaction(async (tx) => {
            const match = await tx.jobMatch.findFirst({ where: { id: jobMatchId, userId }, select: { id: true } });
            if (!match) return false;
            const previous = await tx.matchFeedback.findUnique({ where: { jobMatchId }, select: { userId: true } });
            if (previous && previous.userId !== userId) return false;
            await tx.matchFeedback.upsert({ where: { jobMatchId }, create: { userId, jobMatchId, type }, update: { type } });
            return true;
        }, { maxWait: 5000, timeout: 10000 });
    }
}
