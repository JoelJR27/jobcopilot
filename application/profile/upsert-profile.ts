import { profileSchema } from '@/domain/profile/profile';
import { ValidationError } from '@/shared/errors/validation-error';
import type { ProfileRepository } from './ports/profile-repository';

export class UpsertProfile {
    constructor(private readonly repository: ProfileRepository) {}

    async execute(userId: string, input: unknown) {
        const result = profileSchema.safeParse(input);
        if (!result.success) throw new ValidationError(result.error.issues[0].message);
        return profileSchema.parse(await this.repository.upsert(userId, result.data));
    }
}
