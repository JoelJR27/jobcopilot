import { ApplicationError } from './application-error';

export class AuthenticationError extends ApplicationError {
    constructor(
        message = 'Não foi possível autenticar.',
        code = 'INVALID_CREDENTIALS',
    ) {
        super(message, code);
        this.name = 'AuthenticationError';
    }
}