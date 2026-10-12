import type { Profile } from '@/domain/profile/profile';

export interface ProfileRepository {
    findByUserId(userId: string): Promise<Profile | null>;
    upsert(userId: string, profile: Profile): Promise<Profile>;
}
