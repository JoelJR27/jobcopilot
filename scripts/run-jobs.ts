import 'dotenv/config';
import { z } from 'zod';
import { makeDailyJobPipeline } from '../infrastructure/composition/daily-job-pipeline.ts';
async function main() {
    const env = z.object({ DATABASE_URL: z.url({ error: 'Banco não configurado.' }).refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol), { error: 'Banco inválido.' }) }).safeParse(process.env);
    if (!env.success) throw new Error('PIPELINE_CONFIG');
    const pipeline = makeDailyJobPipeline(env.data.DATABASE_URL);
    try {
        console.log(JSON.stringify({ event: 'job_pipeline_started' }));
        const result = await pipeline.execute();
        console.log(JSON.stringify({ event: result ? 'job_pipeline_completed' : 'job_pipeline_busy', ...(result ?? {}) }));
        if (result?.partial || result?.sources.some((source) => source.failed)) process.exitCode = 1;
    } finally { await pipeline.disconnect(); }
}
main().catch(() => { console.error(JSON.stringify({ event: 'job_pipeline_failed', code: 'PIPELINE_FAILED' })); process.exitCode = 1; });
