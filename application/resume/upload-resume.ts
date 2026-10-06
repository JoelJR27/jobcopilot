import { randomUUID } from 'node:crypto';

import type { ResumeRepository } from './ports/resume-repository';
import type { ResumeStorage } from './ports/resume-storage';

import { validateResumeFile } from './validate-resume-file';

interface UploadResumeInput {
    userId: string;
    fileName: string;
    mimeType: string;
    content: Uint8Array;
}

export class UploadResume {
    constructor(
        private readonly resumeRepository: ResumeRepository,
        private readonly resumeStorage: ResumeStorage,
    ) { }

    async execute(input: UploadResumeInput) {
        validateResumeFile({
            content: input.content,
            mimeType: input.mimeType,
        });

        const currentResume =
            await this.resumeRepository.findByUserId(input.userId);

        const extension =
            input.mimeType === 'application/pdf'
                ? 'pdf'
                : 'docx';

        const newStorageKey =
            `resumes/${input.userId}/${randomUUID()}.${extension}`;

        await this.resumeStorage.save({
            key: newStorageKey,
            content: input.content,
            contentType: input.mimeType,
        });

        let resume;

        try {
            resume = currentResume
                ? await this.resumeRepository.update(
                    currentResume.id,
                    {
                        fileName: input.fileName,
                        storageKey: newStorageKey,
                        mimeType: input.mimeType,
                        fileSize: input.content.byteLength,
                    },
                )
                : await this.resumeRepository.create({
                    userId: input.userId,
                    fileName: input.fileName,
                    storageKey: newStorageKey,
                    mimeType: input.mimeType,
                    fileSize: input.content.byteLength,
                });
        } catch (error) {
            await this.resumeStorage.delete(newStorageKey);

            throw error;
        }

        if (currentResume) {
            try {
                await this.resumeStorage.delete(
                    currentResume.storageKey,
                );
            } catch (error) {
                console.error(
                    'Não foi possível remover o currículo anterior do storage.',
                    error,
                );
            }
        }

        return resume;
    }
}