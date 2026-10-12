import { parseSeedAdminEnv } from '../../shared/config/seed-admin-env.ts';
import type { AdminSeedRepository } from './ports/admin-seed-repository';
import type { PasswordHasher } from './ports/password-hasher';

export async function seedAdmin(
    input: { SEED_ADMIN_EMAIL?: string; SEED_ADMIN_PASSWORD?: string },
    dependencies: {
        repository: AdminSeedRepository;
        passwordHasher: PasswordHasher;
    },
): Promise<void> {
    const settings = parseSeedAdminEnv(input);
    const passwordHash = await dependencies.passwordHasher.hash(settings.SEED_ADMIN_PASSWORD);

    await dependencies.repository.upsertAdmin({
        email: settings.SEED_ADMIN_EMAIL,
        passwordHash,
    });
}
