export interface ResumeRepository {
    findByUserId(userId: string): Promise<{
        id: string;
        userId: string;
        fileName: string;
        storageKey: string;
        mimeType: string;
        fileSize: number;
    } | null>;

    create(data: {
        userId: string;
        fileName: string;
        storageKey: string;
        mimeType: string;
        fileSize: number;
    }): Promise<{
        id: string;
        userId: string;
        fileName: string;
        storageKey: string;
        mimeType: string;
        fileSize: number;
        status: string;
    }>;

    update(
        id: string,
        data: {
            fileName: string;
            storageKey: string;
            mimeType: string;
            fileSize: number;
        },
    ): Promise<{
        id: string;
        userId: string;
        fileName: string;
        storageKey: string;
        mimeType: string;
        fileSize: number;
        status: string;
    }>;
}