import { S3Client } from '@aws-sdk/client-s3';

import { env } from '@/shared/config/env';

export const b2Client = new S3Client({
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 15000, throwOnRequestTimeout: true },
    region: env.B2_REGION,
    endpoint: env.B2_ENDPOINT,
    credentials: {
        accessKeyId: env.B2_KEY_ID,
        secretAccessKey: env.B2_APPLICATION_KEY,
    },
});
