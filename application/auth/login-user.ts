import { AuthenticationError } from '@/shared/errors/authentication-error';

import type { PasswordHasher } from './ports/password-hasher';
import type { SessionManager } from './ports/session-manager';
import type { UserRepository } from './ports/user-repository';

interface LoginUserInput {
    email: string;
    password: string;
}

interface LoginUserOutput {
    sessionId: string;
    user: {
        id: string;
        email: string;
    };
    expiresAt: Date;
}

export class LoginUser {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly passwordHasher: PasswordHasher,
        private readonly sessionManager: SessionManager,
    ) { }

    async execute({
        email,
        password,
    }: LoginUserInput): Promise<LoginUserOutput> {
        const normalizedEmail = email.trim().toLowerCase();

        const user = await this.userRepository.findByEmail(normalizedEmail);

        if (!user) {
            throw new AuthenticationError();
        }

        const passwordMatches = await this.passwordHasher.compare(
            password,
            user.passwordHash,
        );

        if (!passwordMatches) {
            throw new AuthenticationError();
        }

        const session = await this.sessionManager.create(user.id);

        return {
            sessionId: session.sessionId,
            user: {
                id: user.id,
                email: user.email,
            },
            expiresAt: session.expiresAt,
        };
    }
}