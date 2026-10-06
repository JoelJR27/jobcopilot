import { UnauthorizedError } from '@/shared/errors/unauthorized-error';

import type { SessionManager } from './ports/session-manager';

export class GetCurrentSession {
    constructor(
        private readonly sessionManager: SessionManager,
    ) { }

    async execute(sessionId: string | null) {
        if (!sessionId) {
            throw new UnauthorizedError();
        }

        const session = await this.sessionManager.validate(sessionId);

        if (!session) {
            throw new UnauthorizedError();
        }

        return session;
    }
}