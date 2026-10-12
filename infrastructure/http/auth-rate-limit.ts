import { createHash, createHmac } from 'node:crypto';
import type { RateLimiter, RateLimitRule } from '@/application/security/ports/rate-limiter';
import { ServiceUnavailableError } from '@/shared/errors/service-unavailable-error';
import { privateJson } from './account-data';
export class LocalAttemptLimiter {
    private readonly entries = new Map<string, { count: number; expires: number }>();
    consume(key: string, limit: number, windowMs: number, now = Date.now()): number {
        for (const [id, row] of this.entries) if (row.expires <= now) this.entries.delete(id);
        const row = this.entries.get(key);
        if (!row && this.entries.size >= 2000) return Math.ceil(windowMs / 1000);
        const current = row ?? { count: 0, expires: now + windowMs };
        if (current.count >= limit) return Math.ceil((current.expires - now) / 1000);
        current.count += 1; this.entries.set(key, current); return 0;
    }
}
const local = new LocalAttemptLimiter();
export class LocalRateLimiter implements RateLimiter {
    async consume(rule: RateLimitRule) { return local.consume(rule.key, rule.limit, rule.windowMs); }
}
export async function consumeRateLimit(scope: string, identity: string, limit: number, windowMs: number) {
    try {
        const mode = process.env.RATE_LIMIT_MODE || (process.env.NODE_ENV === 'production' ? 'postgres' : 'local');
        if (!['postgres', 'local'].includes(mode) || (process.env.NODE_ENV === 'production' && mode === 'local')) throw new Error();
        const secret = process.env.RATE_LIMIT_KEY_SECRET;
        if (mode === 'postgres' && (!secret || secret.length < 32 || secret.length > 256)) throw new Error();
        const key = scope + ':' + (secret ? createHmac('sha256', secret).update(identity).digest('hex') : createHash('sha256').update(identity).digest('hex'));
        let limiter: RateLimiter = new LocalRateLimiter();
        if (mode === 'postgres') {
            const { prisma } = await import('@/infrastructure/database/prisma/client');
            const { PostgresRateLimiter } = await import('@/infrastructure/security/postgres-rate-limiter');
            limiter = new PostgresRateLimiter(prisma);
        }
        return await limiter.consume({ key, limit, windowMs });
    } catch { throw new ServiceUnavailableError(); }
}
export async function authAttemptLimit(kind: 'login' | 'register', email?: string) {
    return consumeRateLimit(kind, email?.trim().toLowerCase() || 'global', email ? (kind === 'login' ? 15 : 5) : (kind === 'login' ? 100 : 30), email ? (kind === 'login' ? 900000 : 3600000) : 60000);
}
export async function userMutationLimit(scope: 'feedback' | 'source' | 'admin-read' | 'profile' | 'preferences', userId: string) { return consumeRateLimit(scope, userId, 60, 60000); }
export function limitedResponse(wait: number) {
    const response = privateJson({ error: 'Muitas tentativas. Aguarde para repetir.' }, 429);
    response.headers.set('Retry-After', String(wait)); return response;
}
