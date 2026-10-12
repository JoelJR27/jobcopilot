import { ApplicationError } from './application-error';

export class ForbiddenError extends ApplicationError {
    constructor(
        message = 'Você não tem permissão para realizar esta operação.',
        code = 'FORBIDDEN',
    ) {
        super(message, code);
        this.name = 'ForbiddenError';
    }
}
