import type { AdminSeedRepository } from '@/application/auth/ports/admin-seed-repository';
import type { PrismaClient } from '@/generated/prisma/client';

export class PrismaAdminSeedRepository implements AdminSeedRepository {
    private readonly client: PrismaClient;

    constructor(client: PrismaClient) {
        this.client = client;
    }

    async upsertAdmin(input: { email: string; passwordHash: string }): Promise<void> {
        await this.client.$transaction(async (transaction) => {
            const existing = await transaction.user.findUnique({
                where: { email: input.email },
                select: { role: true },
            });

            const user = await transaction.user.upsert({
                where: { email: input.email },
                create: {
                    email: input.email,
                    passwordHash: input.passwordHash,
                    role: 'ADMIN',
                },
                // Não incluir passwordHash no update, mesmo em execuções concorrentes.
                update: { role: 'ADMIN' },
                select: { id: true },
            });

            if (existing?.role === 'USER') {
                await transaction.session.deleteMany({ where: { userId: user.id } });
            }
        }, { maxWait: 5_000, timeout: 10_000 });
    }
}
