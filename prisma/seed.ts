import 'dotenv/config';
import { z } from 'zod';

import { parseSeedAdminEnv } from '../shared/config/seed-admin-env.ts';

async function main(): Promise<void> {
    // Validar antes de carregar o client ou abrir conexão com o banco.
    const settings = parseSeedAdminEnv({
        SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL,
        SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
    });

    const databaseUrl = z.url({ error: 'Configure DATABASE_URL válida.' }).safeParse(process.env.DATABASE_URL);

    if (!databaseUrl.success || !['postgres:', 'postgresql:'].includes(new URL(databaseUrl.data).protocol)) {
        throw new Error('Configure DATABASE_URL válida.');
    }

    const { makeAdminSeed } = await import('../infrastructure/composition/admin-seed.ts');
    const seed = makeAdminSeed(databaseUrl.data);

    try {
        await seed.execute(settings);
        console.info('Administrador configurado com sucesso.');
    } finally {
        await seed.disconnect();
    }
}

main().catch(() => {
    console.error('Não foi possível configurar o administrador. Verifique as variáveis do seed, a conexão e as migrations.');
    process.exitCode = 1;
});
