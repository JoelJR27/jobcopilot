import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client.ts';
import { seedAdmin } from '../../application/auth/seed-admin.ts';
import { BcryptPasswordHasher } from '../auth/password/bcrypt-password-hasher.ts';
import { PrismaAdminSeedRepository } from '../database/prisma/repositories/admin-seed-repository.ts';

export function makeAdminSeed(connectionString: string) {
    const client = new PrismaClient({
        adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }),
        // A CLI recebe apenas mensagens sanitizadas do adapter, sem logs Prisma.
        log: [],
    });

    return {
        execute: (input: { SEED_ADMIN_EMAIL?: string; SEED_ADMIN_PASSWORD?: string }) =>
            seedAdmin(input, {
                repository: new PrismaAdminSeedRepository(client),
                passwordHasher: new BcryptPasswordHasher(),
            }),
        disconnect: () => client.$disconnect(),
    };
}
