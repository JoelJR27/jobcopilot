import type { CollectedJob } from '@/domain/jobs/collected-job';
import type { ExecutionContext } from '@/application/operations/execution-context';

export interface JobCollector {
    collect(context?: ExecutionContext): Promise<CollectedJob[]>;
}
