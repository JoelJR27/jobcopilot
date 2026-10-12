import { ServiceUnavailableError } from '@/shared/errors/service-unavailable-error';
import { NextResponse } from 'next/server';
import { readAccountJson } from '@/infrastructure/http/account-data';
import { assertSafeOrigin } from '@/infrastructure/http/safe-origin';
import { ForbiddenError } from '@/shared/errors/forbidden-error';
import { authAttemptLimit } from '@/infrastructure/http/auth-rate-limit';
const json = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) => NextResponse.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...init.headers } });

import { makeLoginUser } from '@/infrastructure/composition/auth';
import { loginSchema } from '@/features/auth/schemas/login-schema';
import { AuthenticationError } from '@/shared/errors/authentication-error';
import { setSessionCookie, } from '@/infrastructure/auth/session/session-cookie';

export async function POST(request: Request) {
    let body: unknown;

    try {
        assertSafeOrigin(request);
        const wait = await authAttemptLimit('login');
        if (wait) return json({ message: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429, headers: { 'Retry-After': String(wait) } });
        body = await readAccountJson(request);
    } catch (error) {
        if (error instanceof ServiceUnavailableError) return json({ message: 'Serviço temporariamente indisponível.' }, { status: 503 });
        if (error instanceof ForbiddenError) return json({ message: 'Origem não permitida.' }, { status: 403 });
        return json(
            { message: 'Dados de login inválidos.' },
            { status: 400 },
        );
    }

    const validationResult = loginSchema.safeParse(body);

    if (!validationResult.success) {
        return json(
            {
                message: 'Dados de login inválidos.',
                errors: validationResult.error.flatten().fieldErrors,
            },
            { status: 400 },
        );
    }

    try {
    const accountWait = await authAttemptLimit('login', validationResult.data.email);
    if (accountWait) return json({ message: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429, headers: { 'Retry-After': String(accountWait) } });
        const loginUser = makeLoginUser();

        const loginResult = await loginUser.execute(validationResult.data);

        const response = json(
            {
                user: {
                    id: loginResult.user.id,
                    email: loginResult.user.email,
                    role: loginResult.user.role,
                },
            },
            { status: 200, headers: { 'Cache-Control': 'no-store' } },
        );

        setSessionCookie(
            response,
            loginResult.sessionId,
            loginResult.expiresAt,
        );

        return response;
    } catch (error) {
        if (error instanceof ServiceUnavailableError) return json({ message: 'Serviço temporariamente indisponível.' }, { status: 503 });
        if (error instanceof AuthenticationError) {
            return json(
                {
                    message: 'Não foi possível autenticar.',
                },
                { status: 401 },
            );
        }

        console.error('Erro inesperado ao realizar o login.');

        return json(
            {
                message: 'Ocorreu um erro ao realizar o login.',
            },
            { status: 500 },
        );
    }
}
