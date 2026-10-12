import type { UserRole } from '@/domain/auth/user-role';

export interface UserRepository {
    findByEmail(email: string): Promise<{
        id: string;
        email: string;
        passwordHash: string;
        role: UserRole;
    } | null>;

    create(data: {
        email: string;
        passwordHash: string;
    }): Promise<{
        id: string;
        email: string;
        role: UserRole;
    }>;

    findById(id: string): Promise<{
        id: string;
        email: string;
        role: UserRole;
    } | null>;
}
