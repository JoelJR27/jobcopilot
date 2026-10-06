import { NextResponse } from 'next/server';

import { getSessionId } from '@/infrastructure/auth/session/session-cookie';
import { makeGetCurrentUser } from '@/infrastructure/composition/auth';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';

export async function GET() {
    try {
        const sessionId = await getSessionId();

        const getCurrentUser = makeGetCurrentUser();

        const user = await getCurrentUser.execute(sessionId);

        return NextResponse.json(
            {
                user,
            },
            { status: 200 },
        );
    } catch (error) {
        if (error instanceof UnauthorizedError) {
            return NextResponse.json(
                {
                    message: 'Você não está autenticado.',
                },
                { status: 401 },
            );
        }

        console.error(error);

        return NextResponse.json(
            {
                message: 'Ocorreu um erro ao verificar a autenticação.',
            },
            { status: 500 },
        );
    }
}