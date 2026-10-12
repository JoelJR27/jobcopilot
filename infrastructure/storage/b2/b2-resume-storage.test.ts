import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { B2ResumeStorage } from './b2-resume-storage';
import { GetBucketAclCommand } from '@aws-sdk/client-s3';
import { b2Client } from './client';
import { env } from '@/shared/config/env';

describe('B2ResumeStorage', () => {
    const storage = new B2ResumeStorage();
    it('bucket privado sem grants públicos e objeto sintético não é acessível anonimamente', async () => {
        const key = `tests/private-${randomUUID()}.pdf`;
        try {
            const acl = await b2Client.send(new GetBucketAclCommand({ Bucket: env.B2_BUCKET_NAME }));
            expect((acl.Grants ?? []).every((grant) => grant.Grantee?.Type === 'CanonicalUser' && grant.Grantee.ID === acl.Owner?.ID)).toBe(true);
            await storage.save({ key, content: new TextEncoder().encode('%PDF-1.7\nsynthetic'), contentType: 'application/pdf' });
            const url = new URL(env.B2_ENDPOINT); url.pathname = '/' + encodeURIComponent(env.B2_BUCKET_NAME) + '/' + key;
            const response = await fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(5000) });
            await response.body?.cancel();
            expect([401, 403, 404].includes(response.status)).toBe(true);
        } finally {
            const versions = await storage.listVersions('tests/');
            for (const version of versions.filter((value) => value.key === key)) await storage.deleteVersion(key, version.versionId);
        }
    });

    it('deve salvar, recuperar e excluir um arquivo', async () => {
        const storage = new B2ResumeStorage();

        const key = `tests/${randomUUID()}.txt`;

        const content = new TextEncoder().encode(
            'JobCopilot B2 integration test',
        );

        try {
            await storage.save({
                key,
                content,
                contentType: 'text/plain',
            });

            const storedContent = await storage.get(key);

            expect(storedContent).not.toBeNull();

            expect(
                new TextDecoder().decode(storedContent!),
            ).toBe('JobCopilot B2 integration test');
        } finally {
            await storage.delete(key);
        }

        const deletedContent = await storage.get(key);

        expect(deletedContent).toBeNull();
    });

    it('deve retornar null quando o arquivo não existir', async () => {
        const storage = new B2ResumeStorage();

        const result = await storage.get(
            `tests/does-not-exist-${randomUUID()}.txt`,
        );

        expect(result).toBeNull();
    });

    it('deve listar versões e excluir uma versão específica', async () => {
        const key = `tests/resume-version-${crypto.randomUUID()}.pdf`;

        try {
            const firstContent = new TextEncoder().encode('versão 1');
            const secondContent = new TextEncoder().encode('versão 2');

            await storage.save({
                key,
                content: firstContent,
                contentType: 'application/pdf',
            });

            await storage.save({
                key,
                content: secondContent,
                contentType: 'application/pdf',
            });

            const versionsBeforeDelete = await storage.listVersions('tests/');

            const matchingVersions = versionsBeforeDelete.filter(
                (version) =>
                    version.key === key && !version.isDeleteMarker,
            );

            expect(matchingVersions.length).toBeGreaterThanOrEqual(2);

            const versionToDelete = matchingVersions[0];

            await storage.deleteVersion(
                versionToDelete.key,
                versionToDelete.versionId,
            );

            const versionsAfterDelete =
                await storage.listVersions('tests/');

            const deletedVersionStillExists =
                versionsAfterDelete.some(
                    (version) =>
                        version.key === versionToDelete.key &&
                        version.versionId === versionToDelete.versionId,
                );

            expect(deletedVersionStillExists).toBe(false);
        } finally {
            const versions = await storage.listVersions('tests/');

            const testVersions = versions.filter(
                (version) => version.key === key,
            );

            for (const version of testVersions) {
                await storage.deleteVersion(
                    version.key,
                    version.versionId,
                );
            }
        }
    });
});
