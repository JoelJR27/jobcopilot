import { consumeRateLimit } from './auth-rate-limit';
export async function checkResumeUploadLimit(userId: string): Promise<number | null> {
    return (await consumeRateLimit('upload', userId, 10, 3600000)) || null;
}
