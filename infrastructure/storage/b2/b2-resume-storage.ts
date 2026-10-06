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
    ): Promise<
        {
            key: string;
            versionId: string;
            isDeleteMarker: boolean;
            lastModified: Date;
        }[]
    > {
        const response = await b2Client.send(
            new ListObjectVersionsCommand({
                Bucket: env.B2_BUCKET_NAME,
                Prefix: prefix,
            }),
        );

        const versions = [
            ...(response.Versions ?? []).map((version) => ({
                key: version.Key,
                versionId: version.VersionId,
                isDeleteMarker: false,
                lastModified: version.LastModified,
            })),
            ...(response.DeleteMarkers ?? []).map((marker) => ({
                key: marker.Key,
                versionId: marker.VersionId,
                isDeleteMarker: true,
                lastModified: marker.LastModified,
            })),
        ];

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
    ): Promise<void> {
        await b2Client.send(
            new DeleteObjectCommand({
                Bucket: env.B2_BUCKET_NAME,
                Key: key,
                VersionId: versionId,
            }),
        );
    }
}