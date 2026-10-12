import type { Preferences } from '@/domain/preferences/preferences';

export interface PreferenceRepository {
    findByUserId(userId: string): Promise<Preferences | null>;
    upsert(userId: string, preferences: Preferences): Promise<Preferences>;
}
