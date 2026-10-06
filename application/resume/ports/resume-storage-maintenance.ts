export interface ResumeStorageMaintenance {
    listVersions(prefix: string): Promise<{
        key: string;
        versionId: string;
        isDeleteMarker: boolean;
        lastModified: Date;
    }[]>;

    deleteVersion(
        key: string,
        versionId: string,
    ): Promise<void>;
}