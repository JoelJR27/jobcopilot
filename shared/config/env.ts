import { z } from 'zod';

const envSchema = z.object({
    DATABASE_URL: z.url({
        error: 'A URL de conexão com o banco de dados é inválida.',
    }),

    B2_ENDPOINT: z.url({
        error: 'A URL do endpoint do Backblaze B2 é inválida.',
    }),

    B2_REGION: z.string({
        error: 'A região do Backblaze B2 é obrigatória.',
    }).min(1, {
        error: 'A região do Backblaze B2 não pode estar vazia.',
    }),

    B2_KEY_ID: z.string({
        error: 'A chave de acesso do Backblaze B2 é obrigatória.',
    }).min(1, {
        error: 'A chave de acesso do Backblaze B2 não pode estar vazia.',
    }),
    B2_KEY_NAME: z.string({
        error: 'O nome da chave de acesso do Backblaze B2 é obrigatória.',
    }).min(1, {
        error: 'O nome da chave de acesso do Backblaze B2 não pode estar vazia.',
    }),

    B2_APPLICATION_KEY: z.string({
        error: 'A Application Key do Backblaze B2 é obrigatória.',
    }).min(1, {
        error: 'A Application Key do Backblaze B2 não pode estar vazia.',
    }),

    B2_BUCKET_NAME: z.string({
        error: 'O nome do bucket do Backblaze B2 é obrigatório.',
    }).min(1, {
        error: 'O nome do bucket do Backblaze B2 não pode estar vazio.',
    }),
});

export const env = envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    B2_ENDPOINT: process.env.B2_ENDPOINT,
    B2_REGION: process.env.B2_REGION,
    B2_KEY_ID: process.env.B2_KEY_ID,
    B2_KEY_NAME: process.env.B2_KEY_NAME,
    B2_APPLICATION_KEY: process.env.B2_APPLICATION_KEY,
    B2_BUCKET_NAME: process.env.B2_BUCKET_NAME,
});