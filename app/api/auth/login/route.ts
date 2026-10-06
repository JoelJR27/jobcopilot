import { NextResponse } from 'next/server';

import { makeLoginUser } from '@/infrastructure/composition/auth';
import { loginSchema } from '@/features/auth/schemas/login-schema';
import { AuthenticationError } from '@/shared/errors/authentication-error';
import { setSessionCookie, } from '@/infrastructure/auth/session/session-cookie';

export async function POST(request: Request) {
    const body: unknown = await request.json();

    const validationResult = loginSchema.safeParse(body);

    if (!validationResult.success) {
        return NextResponse.json(
            {
                message: 'Dados de login inválidos.',
                errors: validationResult.error.flatten().fieldErrors,
            },
            { status: 400 },
        );
    }

    try {
        const loginUser = makeLoginUser();

        const loginResult = await loginUser.execute(validationResult.data);

        const response = NextResponse.json(
            {
                user: loginResult.user,
            },
            { status: 200 },
        );

        setSessionCookie(
            response,
            loginResult.sessionId,
            loginResult.expiresAt,
        );

        return response;
    } catch (error) {
        if (error instanceof AuthenticationError) {
            return NextResponse.json(
                {
                    message: 'Não foi possível autenticar.',
                },
                { status: 401 },
            );
        }

        console.error(error);

        return NextResponse.json(
            {
                message: 'Ocorreu um erro ao realizar o login.',
            },
            { status: 500 },
        );
    }
}