import { z } from 'zod';
import { feedbackSchema } from '@/domain/jobs/feedback';
import { ValidationError } from '@/shared/errors/validation-error';
import { NotFoundError } from '@/shared/errors/not-found-error';
import type { FeedbackRepository } from './ports/feedback-repository';
export class SaveMatchFeedback {
    constructor(private readonly repository: FeedbackRepository) {}
    async execute(userId: string, jobMatchId: string, input: unknown) {
        if (!z.uuid({ error: 'Identificador inválido.' }).safeParse(jobMatchId).success) throw new ValidationError('Identificador inválido.');
        const result = feedbackSchema.safeParse(input);
        if (!result.success) throw new ValidationError('Selecione um feedback válido.');
        if (!await this.repository.set(userId, jobMatchId, result.data.type)) throw new NotFoundError();
        return { type: result.data.type };
    }
}
