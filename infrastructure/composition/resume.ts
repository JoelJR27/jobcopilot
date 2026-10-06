import { CleanupOrphanedResumes } from '@/application/resume/cleanup-orphaned-resumes';
import { UploadResume } from '@/application/resume/upload-resume';

import { PrismaResumeRepository } from '@/infrastructure/database/prisma/repositories/resume-repository';
import { B2ResumeStorage } from '@/infrastructure/storage/b2/b2-resume-storage';

export function makeUploadResume(): UploadResume {
    const resumeRepository = new PrismaResumeRepository();
    const resumeStorage = new B2ResumeStorage();

    return new UploadResume(
        resumeRepository,
        resumeStorage,
    );
}

export function makeCleanupOrphanedResumes(): CleanupOrphanedResumes {
    const resumeRepository = new PrismaResumeRepository();
    const resumeStorage = new B2ResumeStorage();

    return new CleanupOrphanedResumes({
        resumeRepository,
        resumeStorage,
    });
}