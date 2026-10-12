import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeRateLimit } from '@/infrastructure/http/auth-rate-limit';
import { PostgresRateLimiter } from '@/infrastructure/security/postgres-rate-limiter';
import { ServiceUnavailableError } from '@/shared/errors/service-unavailable-error';
vi.mock('@/infrastructure/database/prisma/client', () => ({ prisma: {} }));
describe('Seleção de rate limit', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
    it('produção recusa local; secret ausente falha fechado', async () => {
        vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('RATE_LIMIT_MODE', 'local');
        await expect(consumeRateLimit('upload', 'fixture', 10, 60000)).rejects.toBeInstanceOf(ServiceUnavailableError);
        vi.stubEnv('RATE_LIMIT_MODE', 'postgres'); vi.stubEnv('RATE_LIMIT_KEY_SECRET', '');
        await expect(consumeRateLimit('upload', 'fixture', 10, 60000)).rejects.toBeInstanceOf(ServiceUnavailableError);
    });
    it('falha do banco não faz fallback local e não vaza erro raw', async () => {
        vi.stubEnv('RATE_LIMIT_MODE', 'postgres'); vi.stubEnv('RATE_LIMIT_KEY_SECRET', 'synthetic-key-test-only-'.repeat(2));
        vi.spyOn(PostgresRateLimiter.prototype, 'consume').mockRejectedValue(new Error('fixture-secret-body'));
        await expect(consumeRateLimit('feedback', 'fixture', 60, 60000)).rejects.toThrow('Serviço temporariamente indisponível.');
    });
    it('identidades persistidas são HMAC e regra preserva Retry-After', async () => {
        vi.stubEnv('RATE_LIMIT_MODE', 'postgres'); vi.stubEnv('RATE_LIMIT_KEY_SECRET', 'synthetic-key-test-only-'.repeat(2));
        const consume = vi.spyOn(PostgresRateLimiter.prototype, 'consume').mockResolvedValue(42);
        expect(await consumeRateLimit('login', 'fixture@example.com', 15, 900000)).toBe(42);
        expect(consume).toHaveBeenCalledWith({ key: expect.stringMatching(/^login:[a-f0-9]{64}$/), limit: 15, windowMs: 900000 });
        expect(JSON.stringify(consume.mock.calls)).not.toContain('fixture@example.com');
    });
});
