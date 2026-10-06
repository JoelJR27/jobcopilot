import type { SessionManager } from '@/application/auth/ports/session-manager';
import type { SessionRepository } from '@/application/auth/ports/session-repository';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

export class PrismaSessionManager implements SessionManager {
    constructor(
        private readonly sessionRepository: SessionRepository,
    ) { }

    async create(userId: string) {
        const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

        const session = await this.sessionRepository.create({
            userId,
            expiresAt,
        });

        return {
            sessionId: session.id,
            expiresAt: session.expiresAt,
        };
    }

    async validate(sessionId: string) {
        const session = await this.sessionRepository.findById(sessionId);

        if (!session) {
            return null;
        }

        if (session.expiresAt <= new Date()) {
            await this.sessionRepository.deleteById(session.id);

            return null;
        }

        return {
            userId: session.userId,
            expiresAt: session.expiresAt,
        };
    }

    async destroy(sessionId: string): Promise<void> {
        await this.sessionRepository.deleteById(sessionId);
    }
}