import type { NormalizedJob } from '@/domain/jobs/collected-job';
import type { ExecutionContext } from '@/application/operations/execution-context';

export interface JobRepository {
    // Retorna o número inserido; conflitos nas duas chaves únicas são duplicadas.
    insertOrIgnore(sourceId: string, jobs: NormalizedJob[], context?: ExecutionContext): Promise<number>;
    observe?(sourceId: string, jobs: NormalizedJob[], context?: ExecutionContext): Promise<{ updated: number; reactivated: number }>;
    expire?(sourceId: string, context?: ExecutionContext): Promise<number>;
}
