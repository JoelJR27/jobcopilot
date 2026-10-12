import { createHash, timingSafeEqual } from 'node:crypto';
export function authorizeJobsRunner(request: Request, secret: string | undefined): 'allowed' | 'unauthorized' | 'unconfigured' {
    if (!secret || secret.length < 32 || secret.length > 256) return 'unconfigured';
    if (new URL(request.url).search) return 'unauthorized';
    const header = request.headers.get('authorization');
    if (!header?.startsWith('Bearer ') || header.length > 263) return 'unauthorized';
    const hash = (value: string) => createHash('sha256').update(value).digest();
    return timingSafeEqual(hash(header.slice(7)), hash(secret)) ? 'allowed' : 'unauthorized';
}
// Best-effort por processo, além do lock PostgreSQL compartilhado durante toda execução.
let lastAccepted = 0;
export function acceptJobsRunner(now = Date.now()): boolean {
    if (lastAccepted && now - lastAccepted < 10 * 60 * 1000) return false;
    lastAccepted = now; return true;
}
