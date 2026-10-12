import { GetRecommendedJobs } from '@/application/jobs/get-recommended-jobs';
import { PrismaMatchingRepository } from '@/infrastructure/database/prisma/repositories/matching-repository';
import { PrismaProfileRepository } from '@/infrastructure/database/prisma/repositories/profile-repository';
import { PrismaPreferenceRepository } from '@/infrastructure/database/prisma/repositories/preference-repository';
import { prisma } from '@/infrastructure/database/prisma/client';
export function makeGetRecommendedJobs() {
    return new GetRecommendedJobs({ repository: new PrismaMatchingRepository(prisma), profiles: new PrismaProfileRepository(prisma), preferences: new PrismaPreferenceRepository(prisma) });
}
