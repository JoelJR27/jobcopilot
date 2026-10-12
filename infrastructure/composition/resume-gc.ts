import { RunResumeGc } from '@/application/resume/run-resume-gc';
import { makeCleanupOrphanedResumes } from '@/infrastructure/composition/resume';
import { PostgresPipelineGuard } from '@/infrastructure/jobs/postgres-pipeline-guard';
import { getDirectDatabaseUrl } from '@/shared/config/database-env';
export function makeRunResumeGc() { return new RunResumeGc({ cleanup: makeCleanupOrphanedResumes(), guard: new PostgresPipelineGuard(getDirectDatabaseUrl(), 3) }); }
