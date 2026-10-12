import { GetOperations } from '@/application/admin/get-operations';
import { SetJobSourceActive } from '@/application/admin/set-job-source-active';
import { PrismaOperationsRepository } from '@/infrastructure/database/prisma/repositories/operations-repository';
import { prisma } from '@/infrastructure/database/prisma/client';
export function makeGetOperations() { return new GetOperations(new PrismaOperationsRepository(prisma)); }
export function makeSetJobSourceActive() { return new SetJobSourceActive(new PrismaOperationsRepository(prisma)); }
