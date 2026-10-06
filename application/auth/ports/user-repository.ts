export interface UserRepository {
    findByEmail(email: string): Promise<{
        id: string;
        email: string;
        passwordHash: string;
    } | null>;

    create(data: {
        email: string;
        passwordHash: string;
    }): Promise<{
        id: string;
        email: string;
    }>;

    findById(id: string): Promise<{
        id: string;
        email: string;
    } | null>;
}