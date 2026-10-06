export interface SessionRepository {
    create(data: {
        userId: string;
        expiresAt: Date;
    }): Promise<{
        id: string;
        userId: string;
        expiresAt: Date;
    }>;

    findById(id: string): Promise<{
        id: string;
        userId: string;
        expiresAt: Date;
    } | null>;

    deleteById(id: string): Promise<void>;
}