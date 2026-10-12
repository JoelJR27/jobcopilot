import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeverJobCollector } from '@/infrastructure/jobs/lever-job-collector';
import { SOURCE_LIMIT, SOURCE_TIMEOUT } from '@/infrastructure/jobs/read-source-json';
import { CIANDT_SOURCE } from '@/shared/config/job-source';
const row = { id: 'fixture', text: 'Mid Developer', descriptionPlain: 'TypeScript', categories: { location: 'Campinas, SP' }, country: 'BR', workplaceType: 'remote', hostedUrl: 'https://jobs.lever.co/ciandt/fixture', createdAt: 1700000000000 };
const response = (payload: unknown) => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
describe('CI&T JSON estruturado', () => {
    afterEach(() => vi.useRealTimers());
    it('valida resposta e não executa conteúdo externo', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([{ ...row, descriptionPlain: '<script>globalThis.executed=true</script>', api_key: 'fixture-only' }]));
        const jobs = await new LeverJobCollector('ciandt', fetcher).collect();
        expect(jobs[0]).toMatchObject({ company: 'CI&T', externalId: 'fixture', location: 'Campinas, SP, Brasil', workModel: 'REMOTE' });
        expect(jobs[0].description).toContain('<script>'); expect('executed' in globalThis).toBe(false);
        expect(jobs[0]).not.toHaveProperty('api_key');
        expect(fetcher).toHaveBeenCalledWith(CIANDT_SOURCE.endpoint, expect.objectContaining({ redirect: 'error', credentials: 'omit' }));
    });
    it('preserva país estrangeiro sem acrescentar Brasil', async () => {
        const jobs = await new LeverJobCollector('ciandt', vi.fn<typeof fetch>().mockResolvedValue(response([{ ...row, country: 'CO', categories: { location: 'Colombia' } }]))).collect();
        expect(jobs[0].location).toBe('Colombia');
    });
    it('omite somente posting sem descrição e registra contagem sanitizada', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => {});
        const jobs = await new LeverJobCollector('ciandt', vi.fn<typeof fetch>().mockResolvedValue(response([{ ...row, descriptionPlain: '' }]))).collect();
        expect(jobs).toEqual([]);
        expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'source_incomplete_posts_skipped', source: 'CI&T / Lever', count: 1 }));
        log.mockRestore();
    });
    it.each([null, {}, [{}], [{ ...row, createdAt: -1 }], [{ ...row, text: 'x'.repeat(501) }], Array(1001).fill(row)])('payload inválido controlado', async (payload) => {
        await expect(new LeverJobCollector('ciandt', vi.fn<typeof fetch>().mockResolvedValue(response(payload))).collect()).rejects.toMatchObject({ code: 'SOURCE_INVALID_PAYLOAD' });
    });
    it.each([400, 401, 403, 429])('HTTP %s não insiste nem vaza body', async (status) => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('fixture-token-body', { status }));
        await expect(new LeverJobCollector('ciandt', fetcher).collect()).rejects.toMatchObject({ code: 'SOURCE_HTTP_ERROR', message: 'Não foi possível coletar as vagas.' });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('retry limitado em 5xx', async () => {
        vi.useFakeTimers(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('fixture', { status: 503 }));
        const promise = expect(new LeverJobCollector('ciandt', fetcher).collect()).rejects.toMatchObject({ code: 'SOURCE_TEMPORARY_ERROR' });
        await vi.runAllTimersAsync(); await promise; expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('timeout cobre fetch e tem só um retry', async () => {
        vi.useFakeTimers(); const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
        const promise = expect(new LeverJobCollector('ciandt', fetcher).collect()).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT * 2 + 750); await promise; expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('timeout cobre stream', async () => {
        vi.useFakeTimers(); const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } }));
        const promise = expect(new LeverJobCollector('ciandt', fetcher).collect()).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT * 2 + 750); await promise;
    });
    it('limita bytes reais sem Content-Length', async () => {
        await expect(new LeverJobCollector('ciandt', vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(SOURCE_LIMIT + 1), { headers: { 'content-type': 'application/json' } }))).collect()).rejects.toMatchObject({ code: 'SOURCE_RESPONSE_TOO_LARGE' });
    });
    it('rejeita tamanho declarado, content-type e redirect', async () => {
        for (const res of [new Response('', { headers: { 'content-type': 'application/json', 'content-length': String(SOURCE_LIMIT + 1) } }), new Response('{}', { headers: { 'content-type': 'text/html' } })]) {
            await expect(new LeverJobCollector('ciandt', vi.fn<typeof fetch>().mockResolvedValue(res)).collect()).rejects.toThrow('Não foi possível coletar');
        }
        const res = response([]); Object.defineProperty(res, 'redirected', { value: true });
        await expect(new LeverJobCollector('ciandt', vi.fn<typeof fetch>().mockResolvedValue(res)).collect()).rejects.toMatchObject({ code: 'SOURCE_REDIRECT_BLOCKED' });
    });
    it.each(['http://jobs.lever.co/ciandt/fixture', 'https://evil.example/ciandt/fixture', 'https://jobs.lever.co/another/fixture', 'https://user:password@jobs.lever.co/ciandt/fixture'])('link inseguro nunca persistido: %s', async (hostedUrl) => {
        await expect(new LeverJobCollector('ciandt', vi.fn<typeof fetch>().mockResolvedValue(response([{ ...row, hostedUrl }]))).collect()).rejects.toThrow();
    });
});
