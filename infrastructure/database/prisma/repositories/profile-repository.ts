import type { ProfileRepository } from '@/application/profile/ports/profile-repository';
import { profileSchema, type Profile } from '@/domain/profile/profile';
import type { PrismaClient } from '@/generated/prisma/client';

const select = {
    headline: true, summary: true, skills: true, experiences: true,
    education: true, languages: true, roles: true, seniority: true,
} as const;

function readProfile(value: unknown): Profile {
    const result = profileSchema.safeParse(value);
    if (!result.success) throw new Error('Os dados persistidos do perfil são inválidos.');
    return result.data;
}

export class PrismaProfileRepository implements ProfileRepository {
    constructor(private readonly client: PrismaClient) {}

    async findByUserId(userId: string) {
        const row = await this.client.profile.findUnique({ where: { userId }, select });
        return row ? readProfile(row) : null;
    }

    async upsert(userId: string, profile: Profile) {
        const data = {
            headline: profile.headline, summary: profile.summary, skills: profile.skills,
            experiences: profile.experiences, education: profile.education,
            languages: profile.languages, roles: profile.roles, seniority: profile.seniority,
        };
        return readProfile(await this.client.profile.upsert({
            where: { userId }, create: { userId, ...data }, update: data, select,
        }));
    }
}
