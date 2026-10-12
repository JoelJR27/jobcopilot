import { GetOnboardingProgress } from '@/application/onboarding/get-onboarding-progress';
import { PrismaResumeRepository } from '@/infrastructure/database/prisma/repositories/resume-repository';
import { makeGetProfile } from './profile';
import { makeGetPreferences } from './preferences';

export function makeGetOnboardingProgress() {
    return new GetOnboardingProgress({ resumeRepository: new PrismaResumeRepository(),
        getProfile: makeGetProfile(), getPreferences: makeGetPreferences() });
}
