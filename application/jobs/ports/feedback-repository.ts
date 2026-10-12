import type { FeedbackType } from '@/domain/jobs/feedback';
export interface FeedbackRepository { set(userId: string, jobMatchId: string, type: FeedbackType): Promise<boolean> }
