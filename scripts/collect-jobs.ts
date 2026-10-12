import 'dotenv/config';
import { z } from 'zod';
import { JobCollectionError } from '../shared/errors/job-collection-error.ts';

async function main() {
    const settings = z.url({ error: 'Configure DATABASE_URL válida.' }).safeParse(process.env.DATABASE_URL);
    if (!settings.success || !['postgres:', 'postgresql:'].includes(new URL(settings.data).protocol)) throw new Error('Banco não configurado.');
    const { makeJobCollection } = await import('../infrastructure/composition/job-collection.ts');
    const collection = makeJobCollection(settings.data);
    try {
        const result = await collection.execute();
        console.info(JSON.stringify({ event: 'job_collection_completed', source: 'Arbeitnow', ...result }));
    } finally { await collection.disconnect(); }
}

main().catch((error: unknown) => {
    console.error(JSON.stringify({ event: 'job_collection_failed', code: error instanceof JobCollectionError ? error.code : 'UNEXPECTED_ERROR',
        message: 'Não foi possível coletar as vagas. Verifique conexão, migrations e disponibilidade da fonte.' }));
    process.exitCode = 1;
});
