import { GetPreferences } from '@/application/preferences/get-preferences';
import { UpsertPreferences } from '@/application/preferences/upsert-preferences';
import { PrismaPreferenceRepository } from '@/infrastructure/database/prisma/repositories/preference-repository';
import { prisma } from '@/infrastructure/database/prisma';

export function makeGetPreferences() { return new GetPreferences(new PrismaPreferenceRepository(prisma)); }
export function makeUpsertPreferences() { return new UpsertPreferences(new PrismaPreferenceRepository(prisma)); }
