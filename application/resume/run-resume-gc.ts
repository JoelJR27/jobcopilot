import type { CleanupOrphanedResumes } from './cleanup-orphaned-resumes';
import type { PipelineGuard } from '../jobs/run-daily-job-pipeline';
import { executionContext } from '../operations/execution-context';
export class RunResumeGc {
    constructor(private readonly dependencies: { cleanup: Pick<CleanupOrphanedResumes, 'execute'>; guard: PipelineGuard }) {}
    async execute(signal?: AbortSignal) {
        const started = Date.now(); const scope = executionContext(45000, signal);
        try { return await this.dependencies.guard.run(async () => {
            try {
                scope.context.check();
                const result = await this.dependencies.cleanup.execute(scope.context);
                return { ...result, partial: result.failed > 0 || scope.context.signal.aborted, durationMs: Date.now() - started };
            } catch { return { deleted: 0, candidates: 0, skipped: 0, failed: 1, partial: true, durationMs: Date.now() - started }; }
        }); } finally { scope.close(); }
    }
}
