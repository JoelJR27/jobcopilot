import type { ExecutionContext } from '@/application/operations/execution-context';
import {
    DeleteObjectCommand,
    GetObjectCommand,
    ListObjectVersionsCommand,
    PutObjectCommand,
} from '@aws-sdk/client-s3';

import type { ResumeStorage } from '@/application/resume/ports/resume-storage';
import type { ResumeStorageMaintenance } from '@/application/resume/ports/resume-storage-maintenance';

import { env } from '@/shared/config/env';

import { b2Client } from './client';

export class B2ResumeStorage
    implements ResumeStorage, ResumeStorageMaintenance {
    async save(input: {
        key: string;
        content: Uint8Array;
        contentType: string;
    }): Promise<void> {
        await b2Client.send(
            new PutObjectCommand({
                Bucket: env.B2_BUCKET_NAME,
                Key: input.key,
                Body: input.content,
                ContentType: input.contentType,
            }),
        );
    }

    async get(key: string): Promise<Uint8Array | null> {
        try {
            const response = await b2Client.send(
                new GetObjectCommand({
                    Bucket: env.B2_BUCKET_NAME,
                    Key: key,
                }),
            );

            if (!response.Body) {
                return null;
            }

            return response.Body.transformToByteArray();
        } catch (error) {
            if (
                error instanceof Error &&
                'name' in error &&
                error.name === 'NoSuchKey'
            ) {
                return null;
            }

            throw error;
        }
    }

    async delete(key: string): Promise<void> {
        await b2Client.send(
            new DeleteObjectCommand({
                Bucket: env.B2_BUCKET_NAME,
                Key: key,
            }),
        );
    }

    async listVersions(
        prefix: string,
        context?: ExecutionContext,
    ): Promise<
        {
            key: string;
            versionId: string;
            isDeleteMarker: boolean;
            lastModified: Date;
        }[]
    > {
        const versions: { key: string | undefined; versionId: string | undefined; isDeleteMarker: boolean; lastModified: Date | undefined }[] = [];
        let keyMarker: string | undefined; let versionMarker: string | undefined;
        for (let page = 0; page < 10; page++) {
            context?.check();
            const response = await b2Client.send(new ListObjectVersionsCommand({ Bucket: env.B2_BUCKET_NAME, Prefix: prefix, MaxKeys: 1000, KeyMarker: keyMarker, VersionIdMarker: versionMarker }), { abortSignal: context?.signal });
            versions.push(...(response.Versions ?? []).map((value) => ({ key: value.Key, versionId: value.VersionId, isDeleteMarker: false, lastModified: value.LastModified })),
                ...(response.DeleteMarkers ?? []).map((value) => ({ key: value.Key, versionId: value.VersionId, isDeleteMarker: true, lastModified: value.LastModified })));
            if (versions.length > 10000) throw new Error('GC_VERSION_LIMIT');
            if (!response.IsTruncated) break;
            if (page === 9 || !response.NextKeyMarker || (response.NextKeyMarker === keyMarker && response.NextVersionIdMarker === versionMarker)) throw new Error('GC_PAGINATION_LIMIT');
            keyMarker = response.NextKeyMarker; versionMarker = response.NextVersionIdMarker;
        }
        return versions.filter(
            (
                version,
            ): version is {
                key: string;
                versionId: string;
                isDeleteMarker: boolean;
                lastModified: Date;
            } =>
                typeof version.key === 'string' &&
                typeof version.versionId === 'string' &&
                version.lastModified instanceof Date,
        );
    }

    async deleteVersion(
        key: string,
        versionId: string,
        context?: ExecutionContext,
    ): Promise<void> {
        await b2Client.send(
            new DeleteObjectCommand({
                Bucket: env.B2_BUCKET_NAME,
                Key: key,
                VersionId: versionId,
            }), { abortSignal: context?.signal },
        );
    }
}
