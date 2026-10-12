import { z } from 'zod';
const database = z.url({ error: 'URL de banco inválida.' }).refine((value) => {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}, { error: 'Banco de produção deve ser PostgreSQL remoto.' });
const secret = z.string({ error: 'Secret obrigatório.' }).min(32, { error: 'Secret deve ter pelo menos 32 caracteres.' }).max(256, { error: 'Secret excede o limite.' });
const schema = z.object({
    DATABASE_URL: database, DIRECT_DATABASE_URL: database,
    APP_URL: z.url({ error: 'APP_URL inválida.' }).refine((value) => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }, { error: 'APP_URL deve usar HTTPS.' }),
    RATE_LIMIT_MODE: z.literal('postgres', { error: 'Produção exige rate limit PostgreSQL.' }),
    RATE_LIMIT_KEY_SECRET: secret, INTERNAL_JOBS_SECRET: secret, CRON_SECRET: secret,
    B2_ENDPOINT: z.url({ error: 'Endpoint B2 inválido.' }).refine((value) => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }, { error: 'Endpoint B2 deve usar HTTPS.' }),
    B2_REGION: z.string({ error: 'Região obrigatória.' }).min(1, { error: 'Região obrigatória.' }),
    B2_KEY_ID: z.string({ error: 'Key obrigatória.' }).min(1, { error: 'Key obrigatória.' }),
    B2_APPLICATION_KEY: z.string({ error: 'Key obrigatória.' }).min(1, { error: 'Key obrigatória.' }),
    B2_KEY_NAME: z.string({ error: 'Nome obrigatório.' }).min(1, { error: 'Nome obrigatório.' }),
    B2_BUCKET_NAME: z.string({ error: 'Bucket obrigatório.' }).min(1, { error: 'Bucket obrigatório.' }),
}).refine((env) => env.CRON_SECRET === env.INTERNAL_JOBS_SECRET, { error: 'Secrets operacionais devem coincidir.' });
export function backendProductionEnvironmentIssues(input: Record<string, string | undefined>): string[] {
    const result = schema.safeParse(input);
    const issues = result.success ? [] : result.error.issues.map((issue) => issue.path.join('.') || 'CRON_SECRET/INTERNAL_JOBS_SECRET');
    for (const name of Object.keys(input)) if (name.startsWith('NEXT_PUBLIC_') && /SECRET|TOKEN|KEY|PASSWORD|DATABASE|B2|COOKIE|CREDENTIAL/i.test(name)) issues.push(name);
    return [...new Set(issues)]; // somente nomes; nunca valores, mensagens Zod/raw issues.
}
