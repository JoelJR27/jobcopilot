import { ServiceUnavailableError } from '@/shared/errors/service-unavailable-error';
import { NextResponse } from 'next/server';
const json = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) => NextResponse.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...init.headers } });

import { MAX_RESUME_SIZE } from '@/application/resume/validate-resume-file';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeUploadResume } from '@/infrastructure/composition/resume';
import { checkResumeUploadLimit } from '@/infrastructure/http/resume-upload-limit';
import { readResumeFormData } from '@/infrastructure/http/read-resume-form-data';

import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { ValidationError } from '@/shared/errors/validation-error';

export async function POST(request: Request) {
    try {
        const user = await requireAuthenticatedUser();

        const origin = request.headers.get('origin');

        if (
            (origin !== null && origin !== new URL(request.url).origin) ||
            request.headers.get('sec-fetch-site') === 'cross-site'
        ) {
            return json(
                { error: 'Origem da requisição não permitida.' },
                { status: 403 },
            );
        }

        const retryAfter = await checkResumeUploadLimit(user.id);

        if (retryAfter !== null) {
            return json(
                { error: 'Muitos envios de currículo. Tente novamente mais tarde.' },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
        }

        if (
            request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
            'multipart/form-data'
        ) {
            throw new ValidationError('Envie o currículo como multipart/form-data.');
        }

        // Vercel limits the whole HTTP body to 4.5 MB; preserve room for multipart.
        // The application/domain limit remains 5 MiB.
        const maximumFileSize = process.env.VERCEL === '1' ? 4 * 1024 * 1024 : MAX_RESUME_SIZE;
        const formData = await readResumeFormData(request, maximumFileSize);
        const file = formData.get('file');

        if (!(file instanceof File)) {
            return json(
                {
                    error: 'O currículo é obrigatório.',
                },
                {
                    status: 400,
                },
            );
        }

        if (file.size > maximumFileSize) {
            throw new ValidationError(
                maximumFileSize < MAX_RESUME_SIZE
                    ? 'Nesta implantação, o currículo deve possuir no máximo 4 MB.'
                    : 'O currículo deve possuir no máximo 5 MB.',
                'RESUME_FILE_TOO_LARGE',
            );
        }

        const content = new Uint8Array(
            await file.arrayBuffer(),
        );

        const uploadResume = makeUploadResume();

        const resume = await uploadResume.execute({
            userId: user.id,
            fileName: file.name,
            mimeType: file.type,
            content,
        });

        return json(
            {
                resume: {
                    id: resume.id,
                    fileName: resume.fileName,
                    mimeType: resume.mimeType,
                    fileSize: resume.fileSize,
                    status: resume.status,
                },
            },
            {
                status: 201,
                headers: { 'Cache-Control': 'no-store' },
            },
        );
    } catch (error) {
        if (error instanceof ServiceUnavailableError) return json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
        if (error instanceof UnauthorizedError) {
            return json(
                {
                    error: error.message,
                },
                {
                    status: 401,
                },
            );
        }

        if (error instanceof ValidationError) {
            return json(
                {
                    error: error.message,
                },
                {
                    status: 400,
                },
            );
        }

        console.error(
            'Erro inesperado ao fazer upload do currículo.',
        );

        return json(
            {
                error: 'Não foi possível enviar o currículo.',
            },
            {
                status: 500,
            },
        );
    }
}
