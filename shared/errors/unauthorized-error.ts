import { ApplicationError } from './application-error';

export class UnauthorizedError extends ApplicationError {
    constructor(
        message = 'Você não está autorizado a realizar esta operação.',
        code = 'UNAUTHORIZED',
    ) {
        super(message, code);
        this.name = 'UnauthorizedError';
    }
}