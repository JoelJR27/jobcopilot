import type { OperationsRepository } from './ports/operations-repository';
export class GetOperations { constructor(private readonly repository: OperationsRepository) {} execute() { return this.repository.getOverview(); } }
