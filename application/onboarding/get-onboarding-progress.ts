import type { ResumeRepository } from '@/application/resume/ports/resume-repository';
import type { GetProfile } from '@/application/profile/get-profile';
import type { GetPreferences } from '@/application/preferences/get-preferences';
import { profileSchema } from '@/domain/profile/profile';
import { preferencesSchema } from '@/domain/preferences/preferences';

export class GetOnboardingProgress {
    constructor(private readonly dependencies: {
        resumeRepository: Pick<ResumeRepository, 'findByUserId'>;
        getProfile: Pick<GetProfile, 'execute'>;
        getPreferences: Pick<GetPreferences, 'execute'>;
    }) {}

    async execute(userId: string) {
        const [resume, profile, preferences] = await Promise.all([
            this.dependencies.resumeRepository.findByUserId(userId),
            this.dependencies.getProfile.execute(userId), this.dependencies.getPreferences.execute(userId),
        ]);
        if (resume && resume.userId !== userId) throw new Error('Não foi possível verificar as etapas da conta.');
        const steps = { account: true, resume: resume !== null, profile: profileSchema.safeParse(profile).success,
            preferences: preferencesSchema.safeParse(preferences).success };
        return { ...steps, ready: steps.resume && steps.profile && steps.preferences };
    }
}
