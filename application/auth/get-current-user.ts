import { UnauthorizedError } from '@/shared/errors/unauthorized-error';

import type { SessionManager } from './ports/session-manager';
import type { UserRepository } from './ports/user-repository';

export class GetCurrentUser {
    constructor(
        private readonly sessionManager: SessionManager,
        private readonly userRepository: UserRepository,
    ) { }

    async execute(sessionId: string | null) {
        if (!sessionId) {
            throw new UnauthorizedError();
        }

        const session = await this.sessionManager.validate(sessionId);

        if (!session) {
            throw new UnauthorizedError();
        }

        const user = await this.userRepository.findById(session.userId);

        if (!user) {
            throw new UnauthorizedError();
        }

        return user;
    }
}