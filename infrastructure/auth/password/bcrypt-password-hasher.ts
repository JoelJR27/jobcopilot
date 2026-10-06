import bcrypt from 'bcrypt';

import type { PasswordHasher } from '@/application/auth/ports/password-hasher';
const BCRYPT_SALT_ROUNDS = 12;

export class BcryptPasswordHasher implements PasswordHasher {
    async hash(password: string): Promise<string> {
        return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    }

    async compare(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }
}