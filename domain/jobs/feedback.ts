import { z } from 'zod';
export const feedbackSchema = z.object({ type: z.enum(['RELEVANT', 'NOT_RELEVANT'], { error: 'Selecione um feedback válido.' }) });
export type FeedbackType = z.infer<typeof feedbackSchema>['type'];
