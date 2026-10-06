import { ConflictError } from '@/shared/errors/conflict-error';
import type { PasswordHasher } from './ports/password-hasher';
import type { UserRepository } from './ports/user-repository';

interface RegisterUserInput {
    email: string;
    password: string;
}

export class RegisterUser {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly passwordHasher: PasswordHasher,
    ) { }

    async execute({ email, password }: RegisterUserInput) {
        const normalizedEmail = email.trim().toLowerCase();

        const existingUser =
            await this.userRepository.findByEmail(normalizedEmail);

        if (existingUser) {
            throw new ConflictError(
                'Não foi possível realizar o cadastro.',
                'USER_ALREADY_EXISTS',
            );
        }

        const passwordHash = await this.passwordHasher.hash(password);

        return this.userRepository.create({
            email: normalizedEmail,
            passwordHash,
        });
    }
}