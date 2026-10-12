import type { UserRepository } from '@/application/auth/ports/user-repository';
import { prisma } from '@/infrastructure/database/prisma';
import { ConflictError } from '@/shared/errors/conflict-error';

export class PrismaUserRepository implements UserRepository {
    async findByEmail(email: string) {
        return prisma.user.findUnique({
            where: {
                email,
            },
            select: {
                id: true,
                email: true,
                passwordHash: true,
                role: true,
            },
        });
    }

    async findById(id: string) {
        return prisma.user.findUnique({
            where: {
                id,
            },
            select: {
                id: true,
                email: true,
                role: true,
            },
        });
    }

    async create(data: {
        email: string;
        passwordHash: string;
    }) {
        try { return await prisma.user.create({
            data: {
                email: data.email,
                passwordHash: data.passwordHash,
                role: 'USER',
            },
            select: {
                id: true,
                email: true,
                role: true,
            },
        }); } catch (error) {
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictError('Não foi possível realizar o cadastro.', 'USER_ALREADY_EXISTS');
            throw error;
        }
    }
}
