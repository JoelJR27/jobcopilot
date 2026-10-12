import { NextResponse } from 'next/server';
import { authorizeJobsRunner } from '@/infrastructure/http/internal-jobs-auth';
import { consumeRateLimit } from '@/infrastructure/http/auth-rate-limit';
import { makeDailyJobPipeline } from '@/infrastructure/composition/daily-job-pipeline';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
// Cron Vercel é GET. Usa a mesma autorização/limiter/use case do POST operacional.
export async function GET(request: Request) {
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET !== process.env.INTERNAL_JOBS_SECRET) return reply(503, 'Execução indisponível.');
    return POST(request);
}
const reply = (status: number, message: string) => NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
    const started = Date.now();
    const authorization = authorizeJobsRunner(request, process.env.INTERNAL_JOBS_SECRET);
    if (authorization === 'unconfigured') return reply(503, 'Execução indisponível.');
    if (authorization !== 'allowed') return reply(401, 'Não autorizado.');
    if (!process.env.DATABASE_URL) return reply(503, 'Execução indisponível.');
    let pipeline: ReturnType<typeof makeDailyJobPipeline> | undefined;
    try {
        const wait = await consumeRateLimit('cron', 'jobs', 5, 600000);
        if (wait) { const response = reply(429, 'Aguarde antes de repetir a execução.'); response.headers.set('Retry-After', String(wait)); return response; }
        console.info(JSON.stringify({ event: 'job_pipeline_started' }));
        pipeline = makeDailyJobPipeline(process.env.DATABASE_URL);
        const result = await pipeline.execute({ signal: request.signal });
        if (!result) { console.info(JSON.stringify({ event: 'job_pipeline_busy', durationMs: Date.now() - started })); return reply(409, 'Execução já em andamento.'); }
        console.info(JSON.stringify({ event: 'job_pipeline_completed', ...result }));
        return result.partial || result.sources.some((source) => source.failed) ? reply(503, 'Execução parcialmente concluída.') : reply(200, 'Execução concluída.');
    } catch { console.error(JSON.stringify({ event: 'job_pipeline_failed', durationMs: Date.now() - started })); return reply(503, 'Não foi possível executar.'); }
    finally { try { await pipeline?.disconnect(); } catch { console.error(JSON.stringify({ event: 'job_pipeline_disconnect_failed' })); } }
}
