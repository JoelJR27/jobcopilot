export interface ResumeStorage {
    save(input: {
        key: string;
        content: Uint8Array;
        contentType: string;
    }): Promise<void>;

    get(key: string): Promise<Uint8Array | null>;

    delete(key: string): Promise<void>;
}