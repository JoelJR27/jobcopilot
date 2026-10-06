const WINDOW_MS = 60 * 60 * 1000;
const MAX_UPLOADS = 10;

// Limite por processo para o MVP; não é compartilhado entre instâncias.
const attempts = new Map<string, { count: number; expiresAt: number }>();

export function checkResumeUploadLimit(userId: string): number | null {
    const now = Date.now();

    for (const [key, attempt] of attempts) {
        if (attempt.expiresAt <= now) {
            attempts.delete(key);
        }
    }

    const attempt = attempts.get(userId);

    if (!attempt) {
        attempts.set(userId, { count: 1, expiresAt: now + WINDOW_MS });
        return null;
    }

    if (attempt.count >= MAX_UPLOADS) {
        return Math.ceil((attempt.expiresAt - now) / 1000);
    }

    attempt.count += 1;
    return null;
}
