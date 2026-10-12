import type { JobCollector } from './ports/job-collector';
import type { JobRepository } from './ports/job-repository';
import type { JobSourceRepository } from './ports/job-source-repository';
import { normalizeJob } from '../../domain/jobs/normalize-job.ts';
import { JobCollectionError } from '../../shared/errors/job-collection-error.ts';
import type { ExecutionContext } from '../operations/execution-context';
import { CollectionProgressError } from './collection-progress-error.ts';

interface Dependencies {
    collector: JobCollector;
    repository: JobRepository;
    sourceRepository: JobSourceRepository;
    source: { name: string; baseUrl: string };
}

export class CollectJobs {
    private readonly dependencies: Dependencies;
    constructor(dependencies: Dependencies) { this.dependencies = dependencies; }

    async execute(context?: ExecutionContext) {
        context?.check();
        const source = await this.dependencies.sourceRepository.ensure(this.dependencies.source);
        if (!source.active) return { collected: 0, inserted: 0, duplicates: 0, skippedInactive: true };
        const jobs = context ? await this.dependencies.collector.collect(context) : await this.dependencies.collector.collect();
        context?.check();
        if (jobs.length > 1000) throw new JobCollectionError('TOO_MANY_JOBS');
        // Validar tudo antes da primeira gravação, sem dataset inteiro do banco em memória.
        const normalized = jobs.map(normalizeJob);
        let inserted = 0;
        let updated = 0; let reactivated = 0;
        let persisted = 0;
        try {
        for (let offset = 0; offset < normalized.length; offset += 100) {
            context?.check();
            const batch = normalized.slice(offset, offset + 100);
            inserted += context ? await this.dependencies.repository.insertOrIgnore(source.id, batch, context) : await this.dependencies.repository.insertOrIgnore(source.id, batch);
            persisted += batch.length;
            const observed = await this.dependencies.repository.observe?.(source.id, batch, context);
            updated += observed?.updated ?? 0; reactivated += observed?.reactivated ?? 0;
        }
        context?.check();
        const deactivated = await this.dependencies.repository.expire?.(source.id, context);
        return { collected: jobs.length, inserted, duplicates: jobs.length - inserted, skippedInactive: false, ...(deactivated === undefined ? {} : { deactivated, updated, reactivated }) };
        } catch { throw new CollectionProgressError({ collected: jobs.length, inserted, duplicates: persisted - inserted, updated, reactivated, deactivated: 0 }); }
    }
}
