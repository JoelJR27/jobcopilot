import { isIP } from 'node:net';
import { collectedJobSchema, type NormalizedJob } from './collected-job.ts';
import { JobCollectionError } from '../../shared/errors/job-collection-error.ts';

export function normalizeJobUrl(input: string): string {
    try {
        const url = new URL(input.trim());
        const hostname = url.hostname.replace(/^\[|\]$/g, '');
        if (
            url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
            isIP(hostname) !== 0 || !hostname.includes('.') ||
            ['localhost', '.localhost', '.local', '.internal', '.test', '.invalid'].some((suffix) => hostname === suffix || hostname.endsWith(suffix))
        ) throw new Error();
        url.hash = '';
        for (const key of [...url.searchParams.keys()]) {
            if (key.toLowerCase().startsWith('utm_') || ['gclid', 'fbclid', 'msclkid'].includes(key.toLowerCase())) url.searchParams.delete(key);
        }
        url.searchParams.sort();
        // Path case e query funcional são preservados; só barra terminal não raiz é removida.
        url.pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';
        return url.toString();
    } catch { throw new JobCollectionError('INVALID_JOB_URL'); }
}

function text(value: string): string {
    // Texto externo (inclusive markup) permanece dado, nunca HTML executável.
    return value.normalize('NFKC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeJob(input: unknown): NormalizedJob {
    const raw = collectedJobSchema.safeParse(input);
    if (!raw.success) throw new JobCollectionError('INVALID_JOB_DATA');
    const normalizedUrl = normalizeJobUrl(raw.data.url);
    const value = collectedJobSchema.safeParse({
        ...raw.data, title: text(raw.data.title), company: text(raw.data.company),
        description: text(raw.data.description), location: raw.data.location ? text(raw.data.location) : undefined,
    });
    if (!value.success) throw new JobCollectionError('INVALID_JOB_DATA');
    return { ...value.data, normalizedUrl };
}
