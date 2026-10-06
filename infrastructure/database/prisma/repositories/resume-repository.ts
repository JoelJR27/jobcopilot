import { ResumeMaintenanceRepository } from '@/application/resume/ports/resume-maintenance-repository';
import type { ResumeRepository } from '@/application/resume/ports/resume-repository';

import { prisma } from '@/infrastructure/database/prisma';

export class PrismaResumeRepository implements ResumeRepository, ResumeMaintenanceRepository {
    async findByUserId(userId: string) {
        return prisma.resume.findUnique({
            where: {
                userId,
            },
            select: {
                id: true,
                userId: true,
                fileName: true,
                storageKey: true,
                mimeType: true,
                fileSize: true,
            },
        });
    }

    async create(data: {
        userId: string;
        fileName: string;
        storageKey: string;
        mimeType: string;
        fileSize: number;
    }) {
        return prisma.resume.create({
            data,
            select: {
                id: true,
                userId: true,
                fileName: true,
                storageKey: true,
                mimeType: true,
                fileSize: true,
                status: true,
            },
        });
    }

    async update(
        id: string,
        data: {
            fileName: string;
            storageKey: string;
            mimeType: string;
            fileSize: number;
        },
    ) {
        return prisma.resume.update({
            where: {
                id,
            },
            data,
            select: {
                id: true,
                userId: true,
                fileName: true,
                storageKey: true,
                mimeType: true,
                fileSize: true,
                status: true,
            },
        });
    }

    async listStorageKeys(): Promise<string[]> {
        const resumes = await prisma.resume.findMany({
            select: {
                storageKey: true,
            },
        });

        return resumes.map((resume) => resume.storageKey);
    }
}