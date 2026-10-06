import { ApplicationError } from "./application-error";

export class ConflictError extends ApplicationError {
    constructor(message: string, code: string) {
        super(message, code);
        this.name = 'ConflictError';
    }
}