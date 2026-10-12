import type { Profile } from '@/domain/profile/profile';
import type { Preferences } from '@/domain/preferences/preferences';
import type { MatchableJob, MatchResult } from '@/domain/jobs/match-job';
export interface EligibleUser { userId: string; profile: Profile; preferences: Preferences }
export interface RecommendedJob {
    id: string; feedback: 'RELEVANT' | 'NOT_RELEVANT' | null;
    score: number; matchedCriteria: string[]; missingCriteria: string[];
    title: string; company: string; location: string | null; workModel: string | null;
    source: string; url: string; publishedAt: Date | null;
}
export interface MatchingRepository {
    loadCheckpoint?(): Promise<{ userCursor: string | null; jobCursor: string | null } | null>;
    saveCheckpoint?(cursor: { userCursor: string | null; jobCursor: string | null }): Promise<void>;
    clearCheckpoint?(): Promise<void>;
    persistBatch?(userId: string, values: { jobId: string; result: import('@/domain/jobs/match-job').MatchResult | null }[], cursor: { userCursor: string | null; jobCursor: string | null }): Promise<{ created: number; updated: number }>;
    listEligibleUsers(after?: string, includeAfter?: boolean): Promise<{ users: EligibleUser[]; next?: string }>;
    listJobs(after?: string): Promise<MatchableJob[]>;
    upsert(userId: string, jobId: string, result: MatchResult): Promise<void>;
    removeIneligible(userId: string, jobId: string): Promise<void>;
    listForUser(userId: string, page: number): Promise<RecommendedJob[]>;
}
