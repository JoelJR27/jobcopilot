import { privateJson } from './account-data';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { ForbiddenError } from '@/shared/errors/forbidden-error';
import { ValidationError } from '@/shared/errors/validation-error';
import { NotFoundError } from '@/shared/errors/not-found-error';
import { ServiceUnavailableError } from '@/shared/errors/service-unavailable-error';
export function operationError(error: unknown) {
    if (error instanceof ServiceUnavailableError) return privateJson({ error: 'Serviço temporariamente indisponível.' }, 503);
    if (error instanceof UnauthorizedError) return privateJson({ error: 'Você não está autenticado.' }, 401);
    if (error instanceof ForbiddenError) return privateJson({ error: 'Operação não permitida.' }, 403);
    if (error instanceof ValidationError) return privateJson({ error: error.message }, 400);
    if (error instanceof NotFoundError) return privateJson({ error: error.message }, 404);
    console.error('Falha inesperada ao processar operação.');
    return privateJson({ error: 'Não foi possível concluir a operação.' }, 500);
}
