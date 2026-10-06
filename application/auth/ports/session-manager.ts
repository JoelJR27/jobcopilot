export interface SessionManager {
    create(userId: string): Promise<{
        sessionId: string;
        expiresAt: Date;
    }>;

    validate(sessionId: string): Promise<{
        userId: string;
        expiresAt: Date;
    } | null>;

    destroy(sessionId: string): Promise<void>;
}