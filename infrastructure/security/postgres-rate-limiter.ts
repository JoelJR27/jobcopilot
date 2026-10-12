import type { PrismaClient } from '@/generated/prisma/client';
import type { RateLimiter, RateLimitRule } from '@/application/security/ports/rate-limiter';
export class PostgresRateLimiter implements RateLimiter {
    private readonly client: PrismaClient;
    constructor(client: PrismaClient) { this.client = client; }
    async consume(rule: RateLimitRule) {
        if (!rule.key.length || rule.key.length > 100 || !Number.isInteger(rule.limit) || rule.limit < 1 || rule.limit > 10000 || !Number.isInteger(rule.windowMs) || rule.windowMs < 1000 || rule.windowMs > 86400000) throw new Error('INVALID_LIMIT');
        return this.client.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(742911, 2)`;
            const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT CURRENT_TIMESTAMP AS now`;
            await tx.rateLimitBucket.deleteMany({ where: { resetAt: { lte: now } } });
            const row = await tx.rateLimitBucket.findUnique({ where: { key: rule.key } });
            if (row && row.count >= rule.limit) return Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000));
            if (!row && await tx.rateLimitBucket.count() >= 10000) return 60;
            if (row) await tx.rateLimitBucket.update({ where: { key: rule.key }, data: { count: { increment: 1 } } });
            else await tx.rateLimitBucket.create({ data: { key: rule.key, count: 1, resetAt: new Date(now.getTime() + rule.windowMs) } });
            return 0;
        }, { maxWait: 3000, timeout: 5000 });
    }
}
