import { ServiceUnavailableError } from '@/shared/errors/service-unavailable-error';
import { NextResponse } from 'next/server';
import { readAccountJson } from '@/infrastructure/http/account-data';
import { assertSafeOrigin } from '@/infrastructure/http/safe-origin';
import { ForbiddenError } from '@/shared/errors/forbidden-error';
import { authAttemptLimit } from '@/infrastructure/http/auth-rate-limit';
const json = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) => NextResponse.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...init.headers } });
import { registerSchema } from '@/features/auth/schemas/register-schema';
import { makeRegisterUser } from '@/infrastructure/composition/auth';
import { ConflictError } from '@/shared/errors/conflict-error';

export async function POST(request: Request) {
    let body: unknown;

    try {
        assertSafeOrigin(request);
        const wait = await authAttemptLimit('register');
        if (wait) return json({ message: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429, headers: { 'Retry-After': String(wait) } });
        body = await readAccountJson(request);
    } catch (error) {
        if (error instanceof ServiceUnavailableError) return json({ message: 'Serviço temporariamente indisponível.' }, { status: 503 });
        if (error instanceof ForbiddenError) return json({ message: 'Origem não permitida.' }, { status: 403 });
        return json(
            { message: 'Dados de cadastro inválidos.' },
            { status: 400 },
        );
    }

    const result = registerSchema.safeParse(body);

    if (!result.success) {
        return json(
            {
                message: 'Dados de cadastro inválidos.',
                errors: result.error.flatten().fieldErrors,
            },
            { status: 400 },
        );
    }

    try {
    const accountWait = await authAttemptLimit('register', result.data.email);
    if (accountWait) return json({ message: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429, headers: { 'Retry-After': String(accountWait) } });
        const registerUser = makeRegisterUser();

        await registerUser.execute(result.data);
        return json({ message: 'Solicitação de cadastro recebida. Tente entrar com suas credenciais.' }, { status: 201 });
    } catch (error) {
        if (error instanceof ServiceUnavailableError) return json({ message: 'Serviço temporariamente indisponível.' }, { status: 503 });
        if (error instanceof ConflictError) return json({ message: 'Solicitação de cadastro recebida. Tente entrar com suas credenciais.' }, { status: 201 });

        console.error('Erro inesperado ao realizar o cadastro.');

        return json(
            {
                message: 'Ocorreu um erro ao realizar o cadastro.',
            },
            { status: 500 },
        );
    }
}
