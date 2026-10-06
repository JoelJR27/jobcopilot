import type { SessionRepository } from '@/application/auth/ports/session-repository';
import { prisma } from '@/infrastructure/database/prisma';

export class PrismaSessionRepository implements SessionRepository {
    async create(data: {
        userId: string;
        expiresAt: Date;
    }) {
        return prisma.session.create({
            data,
            select: {
                id: true,
                userId: true,
                expiresAt: true,
            },
        });
    }

    async findById(id: string) {
        return prisma.session.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                expiresAt: true,
            },
        });
    }

    async deleteById(id: string): Promise<void> {
        await prisma.session.delete({
            where: { id },
        });
    }
}