import type { CollectJobs } from './collect-jobs';
import type { MatchingRepository } from './ports/matching-repository';
import { matchJob } from '../../domain/jobs/match-job.ts';
import { executionContext } from '../operations/execution-context.ts';
import { CollectionProgressError } from './collection-progress-error.ts';
export interface PipelineGuard { run<T>(task: () => Promise<T>): Promise<T | null> }
interface Dependencies { collectors: { name: string; collect: Pick<CollectJobs, 'execute'> }[]; repository: MatchingRepository; guard: PipelineGuard }
export class RunDailyJobPipeline {
    private readonly dependencies: Dependencies;
    constructor(dependencies: Dependencies) { this.dependencies = dependencies; }
    async execute(options: { timeoutMs?: number; signal?: AbortSignal } = {}) {
        const started = Date.now(); const scope = executionContext(options.timeoutMs ?? 240000, options.signal);
        try { return await this.dependencies.guard.run(async () => {
            const result = { sources: [] as { name: string; collected: number; inserted: number; duplicates: number; deactivated: number; reactivated: number; updated: number; failed: boolean }[],
                usersProcessed: 0, matchesUpserted: 0, matchesCreated: 0, matchesUpdated: 0, partial: false, timedOut: false, durationMs: 0 };
            try {
                for (const source of this.dependencies.collectors) {
                    scope.context.check();
                    try {
                        const value = await source.collect.execute(scope.context);
                        result.sources.push({ name: source.name, collected: value.collected, inserted: value.inserted, duplicates: value.duplicates, deactivated: 'deactivated' in value ? value.deactivated ?? 0 : 0,
                            updated: 'updated' in value ? Number(value.updated) : 0, reactivated: 'reactivated' in value ? Number(value.reactivated) : 0, failed: false });
                    } catch (error) { result.partial = true; result.sources.push({ name: source.name, ...(error instanceof CollectionProgressError ? error.counts : { collected: 0, inserted: 0, duplicates: 0, deactivated: 0, updated: 0, reactivated: 0 }), failed: true }); }
                }
                const checkpoint = await this.dependencies.repository.loadCheckpoint?.();
                let userCursor: string | undefined = checkpoint?.userCursor ?? undefined;
                let resumeJob: string | undefined = checkpoint?.jobCursor ?? undefined;
                // Cursor user indica último owner concluído; jobCursor indica retomada do primeiro owner seguinte.
                do {
                    scope.context.check();
                    const batch = resumeJob ? await this.dependencies.repository.listEligibleUsers(userCursor, true) : await this.dependencies.repository.listEligibleUsers(userCursor);
                    if (resumeJob && batch.users[0]?.userId !== userCursor) resumeJob = undefined;
                    for (const user of batch.users) {
                        let jobCursor = resumeJob; resumeJob = undefined;
                        while (true) {
                            scope.context.check(); const jobs = await this.dependencies.repository.listJobs(jobCursor);
                            if (!jobs.length) break;
                            const values = [];
                            for (const job of jobs) { scope.context.check(); values.push({ jobId: job.id, result: matchJob(user.profile, user.preferences, job) }); }
                            const nextJob = jobs[jobs.length - 1].id;
                            if (this.dependencies.repository.persistBatch) {
                                const counts = await this.dependencies.repository.persistBatch(user.userId, values, { userCursor: user.userId, jobCursor: nextJob });
                                result.matchesCreated += counts.created; result.matchesUpdated += counts.updated; result.matchesUpserted += counts.created + counts.updated;
                            } else {
                                for (const value of values) { scope.context.check(); if (value.result) { await this.dependencies.repository.upsert(user.userId, value.jobId, value.result); result.matchesUpserted++; } else await this.dependencies.repository.removeIneligible(user.userId, value.jobId); }
                            }
                            jobCursor = nextJob;
                        }
                        userCursor = user.userId;
                        await this.dependencies.repository.saveCheckpoint?.({ userCursor, jobCursor: null });
                        result.usersProcessed++;
                    }
                    if (!batch.next) break;
                    userCursor = batch.next;
                    await this.dependencies.repository.saveCheckpoint?.({ userCursor, jobCursor: null });
                } while (true);
                await this.dependencies.repository.clearCheckpoint?.();
            } catch { result.partial = true; result.timedOut = scope.context.signal.aborted || Date.now() >= scope.context.deadline; }
            result.durationMs = Date.now() - started; return result;
        }); } finally { scope.close(); }
    }
}
