import { Client } from 'pg';
import { databaseOptions } from '../../shared/config/database-env.ts';
import type { PipelineGuard } from '@/application/jobs/run-daily-job-pipeline';
// Sessão dedicada: advisory lock não pode usar conexões alternadas do pool Prisma.
// Chave interna fixa. Nenhum SQL é construído com input externo.
export class PostgresPipelineGuard implements PipelineGuard {
    private readonly connectionString: string;
    private readonly lockId: number;
    constructor(connectionString: string, lockId: 1 | 3 = 1) { this.connectionString = connectionString; this.lockId = lockId; }
    async run<T>(task: () => Promise<T>): Promise<T | null> {
        const connection = new Client(databaseOptions(this.connectionString));
        try {
            await connection.connect();
            const lock = await connection.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1, $2) AS acquired', [742911, this.lockId]);
            if (!lock.rows[0].acquired) return null;
            try { return await task(); }
            finally { await connection.query('SELECT pg_advisory_unlock($1, $2)', [742911, this.lockId]); }
        } finally { await connection.end(); }
    }
}
