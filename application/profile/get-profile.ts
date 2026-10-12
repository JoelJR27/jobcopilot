import type { ProfileRepository } from './ports/profile-repository';
import { profileSchema } from '@/domain/profile/profile';

export class GetProfile {
    constructor(private readonly repository: ProfileRepository) {}

    async execute(userId: string) {
        const profile = await this.repository.findByUserId(userId);
        return profile === null ? null : profileSchema.parse(profile);
    }
}
