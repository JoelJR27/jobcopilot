import type { PreferenceRepository } from '@/application/preferences/ports/preference-repository';
import { preferencesSchema, type Preferences } from '@/domain/preferences/preferences';
import type { PrismaClient } from '@/generated/prisma/client';

const select = { desiredRoles: true, desiredSkills: true, seniority: true, workModels: true, locations: true } as const;

function readPreferences(value: unknown): Preferences {
    const result = preferencesSchema.safeParse(value);
    if (!result.success) throw new Error('Os dados persistidos das preferências são inválidos.');
    return result.data;
}

export class PrismaPreferenceRepository implements PreferenceRepository {
    constructor(private readonly client: PrismaClient) {}

    async findByUserId(userId: string) {
        const row = await this.client.preference.findUnique({ where: { userId }, select });
        return row ? readPreferences(row) : null;
    }

    async upsert(userId: string, preferences: Preferences) {
        const data = {
            desiredRoles: preferences.desiredRoles, desiredSkills: preferences.desiredSkills,
            seniority: preferences.seniority, workModels: preferences.workModels, locations: preferences.locations,
        };
        return readPreferences(await this.client.preference.upsert({
            where: { userId }, create: { userId, ...data }, update: data, select,
        }));
    }
}
