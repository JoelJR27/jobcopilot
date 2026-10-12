import { preferencesSchema } from '@/domain/preferences/preferences';
import { ValidationError } from '@/shared/errors/validation-error';
import type { PreferenceRepository } from './ports/preference-repository';

export class UpsertPreferences {
    constructor(private readonly repository: PreferenceRepository) {}

    async execute(userId: string, input: unknown) {
        const result = preferencesSchema.safeParse(input);
        if (!result.success) throw new ValidationError(result.error.issues[0].message);
        return preferencesSchema.parse(await this.repository.upsert(userId, result.data));
    }
}
