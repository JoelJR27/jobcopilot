import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { B2ResumeStorage } from './b2-resume-storage';

describe('B2ResumeStorage', () => {
    const storage = new B2ResumeStorage();

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