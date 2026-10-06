import { GetCurrentUser } from '@/application/auth/get-current-user';
import { LoginUser } from '@/application/auth/login-user';
import { LogoutUser } from '@/application/auth/logout-user';
import { RegisterUser } from '@/application/auth/register-user';

import { BcryptPasswordHasher } from '@/infrastructure/auth/password/bcrypt-password-hasher';
import { PrismaSessionManager } from '@/infrastructure/auth/session/prisma-session-manager';

import { PrismaSessionRepository } from '@/infrastructure/database/prisma/repositories/session-repository';
import { PrismaUserRepository } from '@/infrastructure/database/prisma/repositories/user-repository';

export function makeRegisterUser() {
    return new RegisterUser(
        new PrismaUserRepository(),
        new BcryptPasswordHasher(),
    );
}

export function makeLoginUser() {
    return new LoginUser(
        new PrismaUserRepository(),
        new BcryptPasswordHasher(),
        new PrismaSessionManager(
            new PrismaSessionRepository(),
        ),
    );
}

export function makeLogoutUser() {
    return new LogoutUser(
        new PrismaSessionManager(
            new PrismaSessionRepository(),
        ),
    );
}

export function makeGetCurrentUser() {
    return new GetCurrentUser(
        new PrismaSessionManager(
            new PrismaSessionRepository(),
        ),
        new PrismaUserRepository(),
    );
}