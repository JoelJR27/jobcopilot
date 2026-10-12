import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as register } from '@/app/api/auth/register/route';
import { makeLoginUser, makeRegisterUser } from '@/infrastructure/composition/auth';
import { LocalAttemptLimiter } from '@/infrastructure/http/auth-rate-limit';
import { loginSchema } from '@/features/auth/schemas/login-schema';
import { registerSchema } from '@/features/auth/schemas/register-schema';
import { LoginUser } from '@/application/auth/login-user';
import { RegisterUser } from '@/application/auth/register-user';
import { AuthenticationError } from '@/shared/errors/authentication-error';
vi.mock('@/infrastructure/composition/auth');
describe('Hardening auth', () => {
    it('login retorna 429 após limite por identidade antes de autenticar', async () => {
        const execute = vi.spyOn(LoginUser.prototype, 'execute').mockRejectedValue(new AuthenticationError());
        vi.mocked(makeLoginUser).mockReturnValue(Object.create(LoginUser.prototype) as LoginUser);
        const request = () => new Request('https://app.example/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'rate-login@example.com', password: 'FixtureOnly9!' }) });
        for (let i = 0; i < 15; i++) expect((await login(request())).status).toBe(401);
        const response = await login(request()); expect(response.status).toBe(429); expect(response.headers.has('retry-after')).toBe(true); expect(execute).toHaveBeenCalledTimes(15);
    });
    it('cadastro retorna 429 após limite por identidade', async () => {
        const execute = vi.spyOn(RegisterUser.prototype, 'execute').mockResolvedValue({ id: 'fixture', email: 'rate-register@example.com', role: 'USER' });
        vi.mocked(makeRegisterUser).mockReturnValue(Object.create(RegisterUser.prototype) as RegisterUser);
        const request = () => new Request('https://app.example/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'rate-register@example.com', password: 'FixtureOnly9!' }) });
        for (let i = 0; i < 5; i++) expect((await register(request())).status).toBe(201);
        expect((await register(request())).status).toBe(429); expect(execute).toHaveBeenCalledTimes(5);
    });
    afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });
    it.each([login, register])('origem/cross-site negados e no-store', async (handler) => {
        const response = await handler(new Request('https://app.example/api/auth', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }));
        expect(response.status).toBe(403); expect(response.headers.get('cache-control')).toBe('no-store'); expect(makeLoginUser).not.toHaveBeenCalled(); expect(makeRegisterUser).not.toHaveBeenCalled();
    });
    it.each([login, register])('corpo excessivo rejeitado antes de bcrypt', async (handler) => {
        expect((await handler(new Request('https://app.example/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ extra: 'x'.repeat(66000) }) }))).status).toBe(400);
        expect(makeLoginUser).not.toHaveBeenCalled(); expect(makeRegisterUser).not.toHaveBeenCalled();
    });
    it('limiter local expira e isola identidades, com memória limitada', () => {
        const limiter = new LocalAttemptLimiter();
        expect(limiter.consume('a', 1, 1000, 1)).toBe(0); expect(limiter.consume('a', 1, 1000, 2)).toBe(1); expect(limiter.consume('b', 1, 1000, 2)).toBe(0);
        expect(limiter.consume('a', 1, 1000, 1001)).toBe(0);
        for (let i = 0; i < 2000; i++) limiter.consume('key' + i, 1, 1000, 1001);
        expect(limiter.consume('overflow', 1, 1000, 1001)).toBeGreaterThan(0);
    });
    it.each([loginSchema, registerSchema])('senha limitada a 72 bytes e email a 254 chars', (schema) => {
        expect(schema.safeParse({ email: 'a@example.com', password: 'É'.repeat(36) + '9!' }).success).toBe(false);
        expect(schema.safeParse({ email: 'a'.repeat(255) + '@example.com', password: 'FixtureOnly9!' }).success).toBe(false);
    });
});
