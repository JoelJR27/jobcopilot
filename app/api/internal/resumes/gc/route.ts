import { NextResponse } from 'next/server';
import { authorizeJobsRunner } from '@/infrastructure/http/internal-jobs-auth';
import { consumeRateLimit } from '@/infrastructure/http/auth-rate-limit';
import { makeRunResumeGc } from '@/infrastructure/composition/resume-gc';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'; export const maxDuration = 60;
const reply = (status: number, message: string) => NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET !== process.env.INTERNAL_JOBS_SECRET) return reply(503, 'Execução indisponível.');
    return POST(request);
}
export async function POST(request: Request) {
    const started = Date.now();
    const auth = authorizeJobsRunner(request, process.env.INTERNAL_JOBS_SECRET);
    if (auth !== 'allowed') return reply(auth === 'unconfigured' ? 503 : 401, 'Execução não autorizada ou indisponível.');
    try {
        const wait = await consumeRateLimit('cron', 'gc', 5, 600000);
        if (wait) { const response = reply(429, 'Aguarde para repetir.'); response.headers.set('Retry-After', String(wait)); return response; }
        console.info(JSON.stringify({ event: 'resume_gc_started' }));
        const result = await makeRunResumeGc().execute(request.signal);
        if (!result) { console.info(JSON.stringify({ event: 'resume_gc_busy', durationMs: Date.now() - started })); return reply(409, 'Execução em andamento.'); }
        console.info(JSON.stringify({ event: 'resume_gc_completed', ...result }));
        return reply(result.partial ? 503 : 200, result.partial ? 'Execução parcialmente concluída.' : 'Execução concluída.');
    } catch { console.error(JSON.stringify({ event: 'resume_gc_failed', durationMs: Date.now() - started })); return reply(503, 'Execução indisponível.'); }
}
