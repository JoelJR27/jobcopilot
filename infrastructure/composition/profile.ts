import { GetProfile } from '@/application/profile/get-profile';
import { UpsertProfile } from '@/application/profile/upsert-profile';
import { PrismaProfileRepository } from '@/infrastructure/database/prisma/repositories/profile-repository';
import { prisma } from '@/infrastructure/database/prisma';

export function makeGetProfile() { return new GetProfile(new PrismaProfileRepository(prisma)); }
export function makeUpsertProfile() { return new UpsertProfile(new PrismaProfileRepository(prisma)); }
