import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaUserRepository } from '@/infrastructure/database/prisma/repositories/user-repository';
import { prisma } from '@/infrastructure/database/prisma';

vi.mock('@/infrastructure/database/prisma', () => ({
    prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));

describe('PrismaUserRepository roles', () => {
    beforeEach(() => vi.clearAllMocks());

    it('cadastro fixa USER mesmo com propriedades extras em runtime', async () => {
        const input = { email: 'a@example.com', passwordHash: 'test-hash', role: 'ADMIN', id: 'user-b' };
        await new PrismaUserRepository().create(input);
        expect(prisma.user.create).toHaveBeenCalledExactlyOnceWith({
            data: { email: 'a@example.com', passwordHash: 'test-hash', role: 'USER' },
            select: { id: true, email: true, role: true },
        });
    });

    it('busca da sessão seleciona role sem hash', async () => {
        await new PrismaUserRepository().findById('user-a');
        expect(prisma.user.findUnique).toHaveBeenCalledExactlyOnceWith({
            where: { id: 'user-a' }, select: { id: true, email: true, role: true },
        });
    });

    it('busca de login contém hash somente para verificação interna', async () => {
        await new PrismaUserRepository().findByEmail('a@example.com');
        expect(prisma.user.findUnique).toHaveBeenCalledExactlyOnceWith({
            where: { email: 'a@example.com' }, select: { id: true, email: true, role: true, passwordHash: true },
        });
    });
});
