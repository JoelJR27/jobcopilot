import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeverJobCollector } from '@/infrastructure/jobs/lever-job-collector';
import { brazilEligibility } from '@/domain/jobs/brazil-eligibility';
import { SOURCE_LIMIT, SOURCE_TIMEOUT } from '@/infrastructure/jobs/read-source-json';
const row = { id: 'same-id', text: 'Senior Engineer', descriptionPlain: 'TypeScript', categories: { location: 'Brasil' }, country: 'BR', workplaceType: 'remote', hostedUrl: 'https://jobs.lever.co/swile/same-id', createdAt: 1700000000000 };
const response = (payload: unknown) => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
describe('Swile pelo adapter Lever reutilizado', () => {
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
    it.each(['remote', 'onsite'])('Brasil %s usa mesmo domínio', async (workplaceType) => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([{ ...row, workplaceType }]));
        const jobs = await new LeverJobCollector('swile', fetcher).collect();
        expect(jobs[0]).toMatchObject({ company: 'Swile', externalId: 'same-id' });
        expect(brazilEligibility(jobs[0]).eligible).toBe(true);
        expect(fetcher).toHaveBeenCalledWith('https://api.lever.co/v0/postings/swile?mode=json', expect.objectContaining({ redirect: 'error', credentials: 'omit' }));
    });
    it('vaga francesa e remote sem evidência ficam fora', async () => {
        const jobs = await new LeverJobCollector('swile', vi.fn<typeof fetch>().mockResolvedValue(response([{ ...row, country: 'FR', categories: { location: 'Paris, France' } }, { ...row, country: undefined, categories: { location: 'Remote' } }]))).collect();
        expect(jobs.map(brazilEligibility).map((result) => result.eligible)).toEqual([false, false]);
    });
    it('configuração arbitrária é rejeitada sem fetch', () => {
        const fetcher = vi.fn<typeof fetch>();
        expect(() => new LeverJobCollector('evil' as 'swile', fetcher)).toThrow(); expect(fetcher).not.toHaveBeenCalled();
    });
    it('CI&T não aceita link do board Swile', async () => {
        await expect(new LeverJobCollector('ciandt', vi.fn<typeof fetch>().mockResolvedValue(response([row]))).collect()).rejects.toMatchObject({ code: 'SOURCE_INVALID_JOB_URL' });
    });
    it.each([{}, null, [{}], [{ ...row, descriptionPlain: 'x'.repeat(100001) }]])('payload inválido falha fechado', async (payload) => {
        await expect(new LeverJobCollector('swile', vi.fn<typeof fetch>().mockResolvedValue(response(payload))).collect()).rejects.toThrow('Não foi possível coletar');
    });
    it.each(['http://jobs.lever.co/swile/id', 'https://127.0.0.1/swile/id', 'https://jobs.lever.co/other/id', 'https://evil.example/swile/id'])('URL insegura %s', async (hostedUrl) => {
        await expect(new LeverJobCollector('swile', vi.fn<typeof fetch>().mockResolvedValue(response([{ ...row, hostedUrl }]))).collect()).rejects.toThrow();
    });
    it('429 não insiste nem loga body/secret', async () => {
        const log = vi.spyOn(console, 'error'); const info = vi.spyOn(console, 'info');
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('fixture-private-body', { status: 429 }));
        await expect(new LeverJobCollector('swile', fetcher).collect()).rejects.toMatchObject({ code: 'SOURCE_HTTP_ERROR', message: 'Não foi possível coletar as vagas.' });
        expect(fetcher).toHaveBeenCalledTimes(1); expect(log).not.toHaveBeenCalled(); expect(info).not.toHaveBeenCalled();
    });
    it('5xx tem um retry', async () => {
        vi.useFakeTimers(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('fixture-body', { status: 503 }));
        const promise = expect(new LeverJobCollector('swile', fetcher).collect()).rejects.toMatchObject({ code: 'SOURCE_TEMPORARY_ERROR' });
        await vi.runAllTimersAsync(); await promise; expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('timeout limitado', async () => {
        vi.useFakeTimers(); const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
        const promise = expect(new LeverJobCollector('swile', fetcher).collect()).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT * 2 + 750); await promise;
    });
    it('response excessiva', async () => {
        await expect(new LeverJobCollector('swile', vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(SOURCE_LIMIT + 1), { headers: { 'content-type': 'application/json' } }))).collect()).rejects.toMatchObject({ code: 'SOURCE_RESPONSE_TOO_LARGE' });
    });
    it('redirect rejeitado', async () => {
        const res = response([row]); Object.defineProperty(res, 'redirected', { value: true });
        await expect(new LeverJobCollector('swile', vi.fn<typeof fetch>().mockResolvedValue(res)).collect()).rejects.toMatchObject({ code: 'SOURCE_REDIRECT_BLOCKED' });
    });
});
