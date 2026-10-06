import { NextResponse } from 'next/server';

import { MAX_RESUME_SIZE } from '@/application/resume/validate-resume-file';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeUploadResume } from '@/infrastructure/composition/resume';
import { checkResumeUploadLimit } from '@/infrastructure/http/resume-upload-limit';

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
            return NextResponse.json(
                { error: 'Origem da requisição não permitida.' },
                { status: 403 },
            );
        }

        const retryAfter = checkResumeUploadLimit(user.id);

        if (retryAfter !== null) {
            return NextResponse.json(
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

        let formData: FormData;

        try {
            formData = await request.formData();
        } catch {
            throw new ValidationError('O formulário de envio do currículo é inválido.');
        }

        const file = formData.get('file');

        if (!(file instanceof File)) {
            return NextResponse.json(
                {
                    error: 'O currículo é obrigatório.',
                },
                {
                    status: 400,
                },
            );
        }

        if (file.size > MAX_RESUME_SIZE) {
            throw new ValidationError(
                'O currículo deve possuir no máximo 5 MB.',
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

        return NextResponse.json(
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
            },
        );
    } catch (error) {
        if (error instanceof UnauthorizedError) {
            return NextResponse.json(
                {
                    error: error.message,
                },
                {
                    status: 401,
                },
            );
        }

        if (error instanceof ValidationError) {
            return NextResponse.json(
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

        return NextResponse.json(
            {
                error: 'Não foi possível enviar o currículo.',
            },
            {
                status: 500,
            },
        );
    }
}
