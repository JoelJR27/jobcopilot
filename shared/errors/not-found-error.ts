import { ApplicationError } from './application-error';
export class NotFoundError extends ApplicationError {
    constructor() { super('Recurso não encontrado.', 'NOT_FOUND'); }
}
