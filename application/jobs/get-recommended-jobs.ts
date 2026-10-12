import type { MatchingRepository } from './ports/matching-repository';
import type { ProfileRepository } from '../profile/ports/profile-repository';
import type { PreferenceRepository } from '../preferences/ports/preference-repository';
export class GetRecommendedJobs {
    constructor(private readonly dependencies: { repository: MatchingRepository; profiles: ProfileRepository; preferences: PreferenceRepository }) {}
    async execute(userId: string, page = 1) {
        const [profile, preferences] = await Promise.all([this.dependencies.profiles.findByUserId(userId), this.dependencies.preferences.findByUserId(userId)]);
        if (!profile || !preferences) return { incomplete: true, jobs: [] };
        const jobs = await this.dependencies.repository.listForUser(userId, Math.max(1, Math.min(1000, Math.floor(page))));
        return { incomplete: false, jobs };
    }
}
