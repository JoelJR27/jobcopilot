import type { ExecutionContext } from '@/application/operations/execution-context';
import { JobCollectionError } from '../../shared/errors/job-collection-error.ts';
export const SOURCE_LIMIT = 4 * 1024 * 1024;
export const SOURCE_TIMEOUT = 15000;
// Recebe apenas endpoint de configuração interna; não é adapter HTTP exposto ao usuário.
export async function readSourceJson(endpoint: string, fetcher: typeof fetch, context?: ExecutionContext): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        context?.check();
        const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
        let response: Response | undefined; let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const cancel = () => controller.abort();
        context?.signal.addEventListener('abort', cancel, { once: true });
        const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new JobCollectionError('SOURCE_TIMEOUT')); }, Math.min(SOURCE_TIMEOUT, context ? Math.max(1, context.deadline - Date.now()) : SOURCE_TIMEOUT)); });
        let failure: JobCollectionError | undefined;
        try {
            response = await Promise.race([fetcher(endpoint, { signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json', 'User-Agent': 'JobCopilot/0.1' } }), deadline]);
            if (response.redirected) throw new JobCollectionError('SOURCE_REDIRECT_BLOCKED');
            if (response.status !== 200) throw new JobCollectionError(response.status >= 500 && !response.headers.has('retry-after') ? 'SOURCE_TEMPORARY_ERROR' : 'SOURCE_HTTP_ERROR');
            if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new JobCollectionError('SOURCE_CONTENT_TYPE');
            if (Number(response.headers.get('content-length')) > SOURCE_LIMIT) throw new JobCollectionError('SOURCE_RESPONSE_TOO_LARGE');
            if (!response.body) throw new JobCollectionError('SOURCE_INVALID_PAYLOAD');
            reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
            while (true) {
                const part = await Promise.race([reader.read(), deadline]); if (part.done) break;
                total += part.value.byteLength; if (total > SOURCE_LIMIT) throw new JobCollectionError('SOURCE_RESPONSE_TOO_LARGE');
                chunks.push(part.value);
            }
            const bytes = new Uint8Array(total); let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; } catch { throw new JobCollectionError('SOURCE_INVALID_PAYLOAD'); }
        } catch (error) { failure = error instanceof JobCollectionError ? error : new JobCollectionError('SOURCE_NETWORK_ERROR'); }
        finally { context?.signal.removeEventListener('abort', cancel); clearTimeout(timer); if (reader) void reader.cancel().catch(() => {}); else if (response?.body) void response.body.cancel().catch(() => {}); controller.abort(); }
        context?.check();
        if (attempt === 0 && ['SOURCE_NETWORK_ERROR', 'SOURCE_TIMEOUT', 'SOURCE_TEMPORARY_ERROR'].includes(failure!.code)) await new Promise((resolve) => setTimeout(resolve, 750));
        else throw failure;
    }
    throw new JobCollectionError();
}
