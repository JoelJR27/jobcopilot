import { z } from 'zod';
import { ValidationError } from '@/shared/errors/validation-error';
import { NotFoundError } from '@/shared/errors/not-found-error';
import type { OperationsRepository } from './ports/operations-repository';
export class SetJobSourceActive {
    constructor(private readonly repository: OperationsRepository) {}
    async execute(id: string, input: unknown) {
        const result = z.object({ active: z.boolean({ error: 'Informe se a fonte está ativa.' }) }).safeParse(input);
        if (!z.uuid({ error: 'Identificador inválido.' }).safeParse(id).success || !result.success) throw new ValidationError('Dados da fonte inválidos.');
        if (!await this.repository.setSourceActive(id, result.data.active)) throw new NotFoundError();
        return { active: result.data.active };
    }
}
