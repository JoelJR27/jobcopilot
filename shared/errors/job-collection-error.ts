// Erro controlado também utilizável pela CLI Node 24, sem carregar adapters HTTP.
export class JobCollectionError extends Error {
    readonly code: string;

    constructor(code = 'JOB_COLLECTION_FAILED') {
        super('Não foi possível coletar as vagas.');
        this.name = 'JobCollectionError';
        this.code = code;
    }
}
