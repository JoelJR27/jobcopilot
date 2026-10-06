import type { UserRepository } from '@/application/auth/ports/user-repository';
import { prisma } from '@/infrastructure/database/prisma';

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
            },
        });
    }

    async create(data: {
        email: string;
        passwordHash: string;
    }) {
        return prisma.user.create({
            data,
            select: {
                id: true,
                email: true,
            },
        });
    }
}