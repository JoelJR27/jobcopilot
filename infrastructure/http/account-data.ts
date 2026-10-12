import { NextResponse } from 'next/server';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { ForbiddenError } from '@/shared/errors/forbidden-error';
import { ValidationError } from '@/shared/errors/validation-error';
import { ServiceUnavailableError } from '@/shared/errors/service-unavailable-error';

export const MAX_ACCOUNT_BODY_SIZE = 64 * 1024;
export const ACCOUNT_BODY_TIMEOUT_MS = 10_000;

export function privateJson(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function accountDataError(error: unknown) {
    if (error instanceof ServiceUnavailableError) return privateJson({ error: 'Serviço temporariamente indisponível.' }, 503);
    if (error instanceof UnauthorizedError) return privateJson({ error: 'Você não está autenticado.' }, 401);
    if (error instanceof ForbiddenError) return privateJson({ error: 'Origem da requisição não permitida.' }, 403);
    if (error instanceof ValidationError) return privateJson({ error: error.message }, 400);
    console.error('Erro inesperado ao processar dados profissionais.');
    return privateJson({ error: 'Não foi possível processar seus dados. Tente novamente.' }, 500);
}

export async function readAccountJson(request: Request): Promise<unknown> {
    const origin = request.headers.get('origin');
    if ((origin !== null && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
        throw new ForbiddenError();
    }
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw new ValidationError('Envie os dados no formato JSON.');
    }
    if (Number(request.headers.get('content-length')) > MAX_ACCOUNT_BODY_SIZE) {
        throw new ValidationError('Os dados enviados excedem o limite de 64 KiB.');
    }
    if (!request.body) throw new ValidationError('O JSON enviado é inválido.');
    const reader = request.body.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ValidationError('O envio dos dados excedeu o tempo permitido.')), ACCOUNT_BODY_TIMEOUT_MS);
    });
    try {
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
            const { done, value } = await Promise.race([reader.read(), deadline]);
            if (done) break;
            total += value.byteLength;
            if (total > MAX_ACCOUNT_BODY_SIZE) throw new ValidationError('Os dados enviados excedem o limite de 64 KiB.');
            chunks.push(value);
        }
        const content = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength; }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)) as unknown;
    } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw new ValidationError('O JSON enviado é inválido.');
    } finally {
        clearTimeout(timer);
        void reader.cancel().catch(() => {});
    }
}
