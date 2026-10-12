import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkResumeUploadLimit } from '@/infrastructure/http/resume-upload-limit';

describe('Limiter local de upload de currículo', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2035-01-01'));
    });
    afterEach(() => vi.useRealTimers());

    it('aceita dez tentativas, arredonda Retry-After e libera na expiração', async () => {
        for (let i = 0; i < 10; i += 1) expect(await checkResumeUploadLimit('limiter-user-a')).toBeNull();
        expect(await checkResumeUploadLimit('limiter-user-a')).toBe(3600);
        vi.advanceTimersByTime(1500);
        expect(await checkResumeUploadLimit('limiter-user-a')).toBe(3599);
        expect(await checkResumeUploadLimit('limiter-user-b')).toBeNull();
        vi.advanceTimersByTime(60 * 60 * 1000 - 1500);
        expect(await checkResumeUploadLimit('limiter-user-a')).toBeNull();
    });
});
