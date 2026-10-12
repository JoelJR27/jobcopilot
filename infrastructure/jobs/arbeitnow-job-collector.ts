import type { ExecutionContext } from '@/application/operations/execution-context';
import { z } from 'zod';
import type { JobCollector } from '@/application/jobs/ports/job-collector';
import type { CollectedJob } from '@/domain/jobs/collected-job';
import { normalizeJob } from '../../domain/jobs/normalize-job.ts';
import { ARBEITNOW_SOURCE } from '../../shared/config/job-source.ts';
import { JobCollectionError } from '../../shared/errors/job-collection-error.ts';

export const JOB_RESPONSE_LIMIT = 4 * 1024 * 1024;
export const JOB_SOURCE_TIMEOUT_MS = 15000;

const feedSchema = z.object({ data: z.array(z.object({
    slug: z.string({ error: 'Identificador inválido.' }).min(1, { error: 'Identificador obrigatório.' }).max(512, { error: 'Identificador muito longo.' }),
    company_name: z.string({ error: 'Empresa inválida.' }).max(500, { error: 'Empresa muito longa.' }),
    title: z.string({ error: 'Título inválido.' }).max(500, { error: 'Título muito longo.' }),
    description: z.string({ error: 'Descrição inválida.' }).max(100_000, { error: 'Descrição muito longa.' }),
    remote: z.boolean({ error: 'Indicador remoto inválido.' }),
    url: z.string({ error: 'URL inválida.' }).max(2048, { error: 'URL muito longa.' }).pipe(z.url({ error: 'URL inválida.' })),
    location: z.string({ error: 'Localização inválida.' }).max(500, { error: 'Localização muito longa.' }).optional(),
    created_at: z.number({ error: 'Data inválida.' }).int({ error: 'Data inválida.' }).min(0, { error: 'Data inválida.' }).max(4102444800, { error: 'Data inválida.' }).optional(),
}, { error: 'Vaga inválida.' }), { error: 'Lista de vagas inválida.' }).max(1000, { error: 'Quantidade de vagas excessiva.' }) }, { error: 'Resposta da fonte inválida.' });

export class ArbeitnowJobCollector implements JobCollector {
    private readonly fetcher: typeof fetch;
    constructor(fetcher: typeof fetch = fetch) { this.fetcher = fetcher; }

    async collect(context?: ExecutionContext): Promise<CollectedJob[]> {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try { context?.check(); return await this.readFeed(context); } catch (error) {
                context?.check();
                const controlled = error instanceof JobCollectionError ? error : new JobCollectionError('SOURCE_NETWORK_ERROR');
                if (attempt === 0 && ['SOURCE_NETWORK_ERROR', 'SOURCE_TIMEOUT', 'SOURCE_TEMPORARY_ERROR'].includes(controlled.code)) {
                    await new Promise((resolve) => setTimeout(resolve, 750));
                    continue;
                }
                throw controlled;
            }
        }
        throw new JobCollectionError();
    }

    private async readFeed(context?: ExecutionContext): Promise<CollectedJob[]> {
        const controller = new AbortController();
        const cancel = () => controller.abort();
        context?.signal.addEventListener('abort', cancel, { once: true });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<never>((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new JobCollectionError('SOURCE_TIMEOUT')); }, Math.min(JOB_SOURCE_TIMEOUT_MS, context ? Math.max(1, context.deadline - Date.now()) : JOB_SOURCE_TIMEOUT_MS));
        });
        let response: Response | undefined;
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        try {
            response = await Promise.race([this.fetcher(ARBEITNOW_SOURCE.endpoint, {
                signal: controller.signal, redirect: 'error', cache: 'no-store', credentials: 'omit',
                headers: { Accept: 'application/json', 'User-Agent': 'JobCopilot/0.1' },
            }), deadline]);
            if (response.redirected) throw new JobCollectionError('SOURCE_REDIRECT_BLOCKED');
            if (response.status !== 200) {
                // Não insistir em 429 nem contrariar Retry-After do provider.
                throw new JobCollectionError(response.status >= 500 && !response.headers.has('retry-after') ? 'SOURCE_TEMPORARY_ERROR' : 'SOURCE_HTTP_ERROR');
            }
            if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new JobCollectionError('SOURCE_CONTENT_TYPE');
            if (Number(response.headers.get('content-length')) > JOB_RESPONSE_LIMIT) throw new JobCollectionError('SOURCE_RESPONSE_TOO_LARGE');
            if (!response.body) throw new JobCollectionError('SOURCE_INVALID_PAYLOAD');
            reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let total = 0;
            while (true) {
                const { done, value } = await Promise.race([reader.read(), deadline]);
                if (done) break;
                total += value.byteLength;
                if (total > JOB_RESPONSE_LIMIT) throw new JobCollectionError('SOURCE_RESPONSE_TOO_LARGE');
                chunks.push(value);
            }
            const bytes = new Uint8Array(total);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            let payload: unknown;
            try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; } catch { throw new JobCollectionError('SOURCE_INVALID_PAYLOAD'); }
            const result = feedSchema.safeParse(payload);
            if (!result.success) throw new JobCollectionError('SOURCE_INVALID_PAYLOAD');
            return result.data.data.map((row) => {
                const url = new URL(row.url);
                if (!ARBEITNOW_SOURCE.jobHosts.some((host) => host === url.hostname)) throw new JobCollectionError('SOURCE_INVALID_JOB_URL');
                return normalizeJob({ externalId: row.slug, url: row.url, title: row.title, company: row.company_name,
                    description: row.description, location: row.location, workModel: row.remote ? 'REMOTE' : undefined,
                    publishedAt: row.created_at === undefined ? undefined : new Date(row.created_at * 1000) });
            });
        } catch (error) {
            if (controller.signal.aborted) throw new JobCollectionError('SOURCE_TIMEOUT');
            if (error instanceof JobCollectionError) throw error;
            throw new JobCollectionError('SOURCE_NETWORK_ERROR');
        } finally {
            context?.signal.removeEventListener('abort', cancel);
            clearTimeout(timer);
            if (reader) void reader.cancel().catch(() => {});
            else if (response?.body) void response.body.cancel().catch(() => {});
            controller.abort();
        }
    }
}
