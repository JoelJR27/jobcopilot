import { SaveMatchFeedback } from '@/application/jobs/save-match-feedback';
import { PrismaFeedbackRepository } from '@/infrastructure/database/prisma/repositories/feedback-repository';
import { prisma } from '@/infrastructure/database/prisma/client';
export function makeSaveMatchFeedback() { return new SaveMatchFeedback(new PrismaFeedbackRepository(prisma)); }
