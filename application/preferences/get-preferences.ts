import type { PreferenceRepository } from './ports/preference-repository';
import { preferencesSchema } from '@/domain/preferences/preferences';

export class GetPreferences {
    constructor(private readonly repository: PreferenceRepository) {}

    async execute(userId: string) {
        const preferences = await this.repository.findByUserId(userId);
        return preferences === null ? null : preferencesSchema.parse(preferences);
    }
}
