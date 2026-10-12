import { z } from 'zod';
const schema = z.url({ error: 'Banco inválido.' }).refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol), { error: 'Banco inválido.' });
export function getDatabaseUrl(input: string | undefined = process.env.DATABASE_URL) {
    const result = schema.safeParse(input); if (!result.success) throw new Error('Configuração de banco inválida.');
    return result.data;
}
export function getDirectDatabaseUrl(fallback?: string) {
    if (process.env.VERCEL === '1' && !process.env.DIRECT_DATABASE_URL) throw new Error('Conexão direta não configurada.');
    return getDatabaseUrl(process.env.DIRECT_DATABASE_URL || fallback || process.env.DATABASE_URL);
}
export function databaseOptions(input: string) {
    const url = new URL(getDatabaseUrl(input));
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!local) {
        // Evita sslmode sobrescrever rejectUnauthorized na configuração do pg.
        for (const name of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(name);
    }
    return { connectionString: url.toString(), max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, statement_timeout: 5000,
        ...(local ? {} : { ssl: { rejectUnauthorized: true } }) };
}
