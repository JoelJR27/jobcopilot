import { describe, expect, it, vi } from 'vitest';

import { PrismaAdminSeedRepository } from '@/infrastructure/database/prisma/repositories/admin-seed-repository';
import type { PrismaClient } from '@/generated/prisma/client';

function makeClient(existingRole: 'USER' | 'ADMIN' | null) {
    const transaction = {
        user: {
            findUnique: vi.fn(async () => existingRole ? { role: existingRole } : null),
            upsert: vi.fn(async () => ({ id: 'seeded-admin' })),
        },
        session: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    };
    const client = {
        $transaction: vi.fn(async (execute: (tx: typeof transaction) => Promise<void>) => execute(transaction)),
    };
    return { transaction, client: client as unknown as PrismaClient };
}

describe('PrismaAdminSeedRepository', () => {
    it.each([null, 'USER', 'ADMIN'] as const)('upsert com role anterior %s preserva senha existente', async (role) => {
        const { client, transaction } = makeClient(role);
        await new PrismaAdminSeedRepository(client).upsertAdmin({ email: 'admin@example.com', passwordHash: 'test-new-hash' });
        expect(transaction.user.upsert).toHaveBeenCalledExactlyOnceWith({
            where: { email: 'admin@example.com' },
            create: { email: 'admin@example.com', passwordHash: 'test-new-hash', role: 'ADMIN' },
            update: { role: 'ADMIN' },
            select: { id: true },
        });
        if (role === 'USER') {
            expect(transaction.session.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { userId: 'seeded-admin' } });
        } else {
            expect(transaction.session.deleteMany).not.toHaveBeenCalled();
        }
        expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5000, timeout: 10000 });
    });

    it('falha na revogação é propagada para rollback da transação', async () => {
        const { client, transaction } = makeClient('USER');
        transaction.session.deleteMany.mockRejectedValue(new Error('test-revoke-failure'));
        await expect(new PrismaAdminSeedRepository(client).upsertAdmin({ email: 'admin@example.com', passwordHash: 'test-hash' }))
            .rejects.toThrow('test-revoke-failure');
    });
});
