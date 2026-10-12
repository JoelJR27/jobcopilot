import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArbeitnowJobCollector, JOB_RESPONSE_LIMIT, JOB_SOURCE_TIMEOUT_MS } from '@/infrastructure/jobs/arbeitnow-job-collector';
import { JobCollectionError } from '@/shared/errors/job-collection-error';
import { ARBEITNOW_SOURCE } from '@/shared/config/job-source';
import { arbeitnowFeedFixture } from '@/tests/fixtures/collected-jobs';

function response(value: unknown = arbeitnowFeedFixture) { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json; charset=utf-8' } }); }

describe('ArbeitnowJobCollector', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
    it('valida fonte real JSON e faz só request fixa sem cookies/redirects', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
        const jobs = await new ArbeitnowJobCollector(fetcher).collect();
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({ externalId: 'developer-fixture', company: 'Empresa de teste', workModel: 'REMOTE', location: 'Berlin' });
        expect(jobs[0].publishedAt).toBeInstanceOf(Date);
        expect(fetcher).toHaveBeenCalledExactlyOnceWith(ARBEITNOW_SOURCE.endpoint, expect.objectContaining({ redirect: 'error', credentials: 'omit', signal: expect.any(AbortSignal) }));
    });
    it('não infere presencial para remote=false nem segue links do feed', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: [{ ...arbeitnowFeedFixture.data[0], remote: false }], links: { next: 'http://169.254.169.254/private' } }));
        expect((await new ArbeitnowJobCollector(fetcher).collect())[0].workModel).toBeUndefined();
        expect(fetcher).toHaveBeenCalledOnce();
    });
    it.each(['www.arbeitnow.co.uk', 'www.arbeitnow.fr', 'www.arbeitnow.ch'])('aceita job host preconfigurado %s da mesma fonte', async (host) => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: [{ ...arbeitnowFeedFixture.data[0], url: `https://${host}/jobs/fixture` }] }));
        expect(await new ArbeitnowJobCollector(fetcher).collect()).toHaveLength(1);
    });
    it.each([{}, { data: [{}] }, { data: [{ ...arbeitnowFeedFixture.data[0], remote: 'true' }] },
        { data: [{ ...arbeitnowFeedFixture.data[0], description: 'a'.repeat(100001) }] },
        { data: Array(1001).fill(arbeitnowFeedFixture.data[0]) },
    ])('rejeita payload inválido/excessivo sem retry', async (payload) => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(payload));
        await expect(new ArbeitnowJobCollector(fetcher).collect()).rejects.toBeInstanceOf(JobCollectionError);
        expect(fetcher).toHaveBeenCalledOnce();
    });
    it.each([401, 404, 429, 302])('erro HTTP %s não vaza body/token nem tenta outro host', async (status) => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('private-token-fixture', { status, headers: { location: 'http://127.0.0.1' } }));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(new ArbeitnowJobCollector(fetcher).collect()).rejects.toThrow('Não foi possível coletar as vagas.');
        expect(fetcher).toHaveBeenCalledOnce();
        expect(log).not.toHaveBeenCalled();
    });
    it('retry HTTP transitório é limitado a duas requests', async () => {
        vi.useFakeTimers();
        const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('private-fixture', { status: 503 }));
        const result = expect(new ArbeitnowJobCollector(fetcher).collect()).rejects.toThrow(JobCollectionError);
        await vi.advanceTimersByTimeAsync(750);
        await result;
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('Retry-After do provider impede retry imediato', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503, headers: { 'retry-after': '60' } }));
        await expect(new ArbeitnowJobCollector(fetcher).collect()).rejects.toThrow(JobCollectionError);
        expect(fetcher).toHaveBeenCalledOnce();
    });
    it.each(['request', 'body'])('timeout explícito cobre %s e retry também termina', async (stage) => {
        vi.useFakeTimers();
        const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => stage === 'request'
            ? new Promise<Response>(() => {})
            : new Response(new ReadableStream<Uint8Array>(), { headers: { 'content-type': 'application/json' } }));
        const result = expect(new ArbeitnowJobCollector(fetcher).collect()).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(JOB_SOURCE_TIMEOUT_MS * 2 + 750);
        await result;
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('limita bytes reais mesmo sem Content-Length', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(JOB_RESPONSE_LIMIT + 1), { headers: { 'content-type': 'application/json' } }));
        await expect(new ArbeitnowJobCollector(fetcher).collect()).rejects.toMatchObject({ code: 'SOURCE_RESPONSE_TOO_LARGE' });
        expect(fetcher).toHaveBeenCalledOnce();
    });
    it('rejeita Content-Length excessivo antes de ler', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(JOB_RESPONSE_LIMIT + 1) } }));
        await expect(new ArbeitnowJobCollector(fetcher).collect()).rejects.toMatchObject({ code: 'SOURCE_RESPONSE_TOO_LARGE' });
    });
    it('rejeita content-type errado e JSON malformado sem log raw', async () => {
        for (const result of [new Response('<script>private-fixture</script>', { headers: { 'content-type': 'text/html' } }), new Response('{invalid', { headers: { 'content-type': 'application/json' } })]) {
            const fetcher = vi.fn<typeof fetch>().mockResolvedValue(result);
            await expect(new ArbeitnowJobCollector(fetcher).collect()).rejects.toThrow('Não foi possível coletar as vagas.');
        }
    });
    it.each(['https://localhost/jobs/fixture', 'https://127.0.0.1/jobs/fixture', 'https://unknown.example.com/jobs/fixture', 'javascript:alert(1)'])('rejeita URL externa não permitida %s sem buscá-la', async (url) => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: [{ ...arbeitnowFeedFixture.data[0], url }] }));
        await expect(new ArbeitnowJobCollector(fetcher).collect()).rejects.toThrow(JobCollectionError);
        expect(fetcher).toHaveBeenCalledOnce();
    });
});
