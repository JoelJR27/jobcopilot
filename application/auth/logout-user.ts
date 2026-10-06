import type { SessionManager } from './ports/session-manager';

export class LogoutUser {
    constructor(
        private readonly sessionManager: SessionManager,
    ) { }

    async execute(sessionId: string): Promise<void> {
        await this.sessionManager.destroy(sessionId);
    }
}