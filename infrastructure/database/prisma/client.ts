import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl, databaseOptions } from '@/shared/config/database-env';

const connectionString = getDatabaseUrl();

const adapter = new PrismaPg(databaseOptions(connectionString));

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined; };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter, log: [] });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
