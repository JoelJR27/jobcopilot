import { describe, expect, it } from 'vitest';

import { UploadResume } from '@/application/resume/upload-resume';
import type { ResumeRepository } from '@/application/resume/ports/resume-repository';
import type { ResumeStorage } from '@/application/resume/ports/resume-storage';

const PDF_MIME_TYPE = 'application/pdf';

function makePdfContent(): Uint8Array {
    return new Uint8Array([
        0x25,
        0x50,
        0x44,
        0x46,
        0x2d,
        ...new TextEncoder().encode('test'),
    ]);
}

function makeResumeRepository(
    currentResume: Awaited<
        ReturnType<ResumeRepository['findByUserId']>
    > = null,
): ResumeRepository {
    return {
        findByUserId: async () => currentResume,

        create: async (data) => ({
            id: 'resume-1',
            userId: data.userId,
            fileName: data.fileName,
            storageKey: data.storageKey,
            mimeType: data.mimeType,
            fileSize: data.fileSize,
            status: 'PENDING',
        }),

        update: async (id, data) => ({
            id,
            userId: currentResume!.userId,
            fileName: data.fileName,
            storageKey: data.storageKey,
            mimeType: data.mimeType,
            fileSize: data.fileSize,
            status: 'PENDING',
        }),
    };
}

function makeResumeStorage(): ResumeStorage & {
    savedKeys: string[];
    deletedKeys: string[];
} {
    const savedKeys: string[] = [];
    const deletedKeys: string[] = [];

    return {
        savedKeys,
        deletedKeys,

        save: async ({ key }) => {
            savedKeys.push(key);
        },

        get: async () => null,

        delete: async (key) => {
            deletedKeys.push(key);
        },
    };
}

describe('UploadResume', () => {
    it('deve criar o currículo quando o usuário não possui um', async () => {
        const repository = makeResumeRepository();
        const storage = makeResumeStorage();

        const uploadResume = new UploadResume(
            repository,
            storage,
        );

        const result = await uploadResume.execute({
            userId: 'user-1',
            fileName: 'curriculo.pdf',
            mimeType: PDF_MIME_TYPE,
            content: makePdfContent(),
        });

        expect(result.userId).toBe('user-1');
        expect(result.fileName).toBe('curriculo.pdf');

        expect(storage.savedKeys).toHaveLength(1);
        expect(storage.deletedKeys).toHaveLength(0);
    });

    it('deve substituir o currículo existente', async () => {
        const currentResume = {
            id: 'resume-old',
            userId: 'user-1',
            fileName: 'curriculo-antigo.pdf',
            storageKey: 'resumes/user-1/old.pdf',
            mimeType: PDF_MIME_TYPE,
            fileSize: 100,
        };

        const repository = makeResumeRepository(
            currentResume,
        );

        const storage = makeResumeStorage();

        const uploadResume = new UploadResume(
            repository,
            storage,
        );

        const result = await uploadResume.execute({
            userId: 'user-1',
            fileName: 'curriculo-novo.pdf',
            mimeType: PDF_MIME_TYPE,
            content: makePdfContent(),
        });

        expect(result.id).toBe('resume-old');
        expect(result.userId).toBe('user-1');
        expect(result.fileName).toBe('curriculo-novo.pdf');

        expect(storage.savedKeys).toHaveLength(1);
        expect(storage.deletedKeys).toEqual([
            currentResume.storageKey,
        ]);

        expect(storage.deletedKeys[0]).not.toBe(
            storage.savedKeys[0],
        );
    });

    it('deve remover o novo arquivo quando o banco falhar', async () => {
        const repository: ResumeRepository = {
            findByUserId: async () => null,

            create: async () => {
                throw new Error('database error');
            },

            update: async () => {
                throw new Error('database error');
            },
        };

        const storage = makeResumeStorage();

        const uploadResume = new UploadResume(
            repository,
            storage,
        );

        await expect(
            uploadResume.execute({
                userId: 'user-1',
                fileName: 'curriculo.pdf',
                mimeType: PDF_MIME_TYPE,
                content: makePdfContent(),
            }),
        ).rejects.toThrow('database error');

        expect(storage.savedKeys).toHaveLength(1);

        expect(storage.deletedKeys).toEqual([
            storage.savedKeys[0],
        ]);
    });

    it('não deve persistir o currículo quando o storage falhar', async () => {
        let createCalled = false;
        let updateCalled = false;

        const repository: ResumeRepository = {
            findByUserId: async () => null,

            create: async () => {
                createCalled = true;

                throw new Error(
                    'database should not be called',
                );
            },

            update: async () => {
                updateCalled = true;

                throw new Error(
                    'database should not be called',
                );
            },
        };

        const storage: ResumeStorage = {
            save: async () => {
                throw new Error('storage error');
            },

            get: async () => null,

            delete: async () => { },
        };

        const uploadResume = new UploadResume(
            repository,
            storage,
        );

        await expect(
            uploadResume.execute({
                userId: 'user-1',
                fileName: 'curriculo.pdf',
                mimeType: PDF_MIME_TYPE,
                content: makePdfContent(),
            }),
        ).rejects.toThrow('storage error');

        expect(createCalled).toBe(false);
        expect(updateCalled).toBe(false);
    });

    it('deve manter o novo currículo quando a remoção do antigo falhar', async () => {
        const currentResume = {
            id: 'resume-old',
            userId: 'user-1',
            fileName: 'curriculo-antigo.pdf',
            storageKey: 'resumes/user-1/old.pdf',
            mimeType: PDF_MIME_TYPE,
            fileSize: 100,
        };

        const repository = makeResumeRepository(
            currentResume,
        );

        const savedKeys: string[] = [];
        const deletedKeys: string[] = [];

        const storage: ResumeStorage & {
            savedKeys: string[];
            deletedKeys: string[];
        } = {
            savedKeys,
            deletedKeys,

            save: async ({ key }) => {
                savedKeys.push(key);
            },

            get: async () => null,

            delete: async (key) => {
                deletedKeys.push(key);

                throw new Error('delete error');
            },
        };

        const uploadResume = new UploadResume(
            repository,
            storage,
        );

        const result = await uploadResume.execute({
            userId: 'user-1',
            fileName: 'curriculo-novo.pdf',
            mimeType: PDF_MIME_TYPE,
            content: makePdfContent(),
        });

        expect(result.id).toBe('resume-old');
        expect(result.fileName).toBe('curriculo-novo.pdf');

        expect(storage.savedKeys).toHaveLength(1);
        expect(storage.deletedKeys).toEqual([
            currentResume.storageKey,
        ]);

        expect(storage.deletedKeys[0]).not.toBe(
            storage.savedKeys[0],
        );
    });
});