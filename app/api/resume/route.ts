import { NextResponse } from 'next/server';

import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeUploadResume } from '@/infrastructure/composition/resume';

import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { ValidationError } from '@/shared/errors/validation-error';

export async function POST(request: Request) {
    try {
        const user = await requireAuthenticatedUser();

        const formData = await request.formData();
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
            error,
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