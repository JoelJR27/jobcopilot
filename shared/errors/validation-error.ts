import { ApplicationError } from './application-error';

export class ValidationError extends ApplicationError {
    constructor(
        message: string,
        code = 'VALIDATION_ERROR',
    ) {
        super(message, code);
        this.name = 'ValidationError';
    }
}