import { z } from 'zod';

export const loginSchema = z.object({
    email: z.email({
        error: 'Informe um endereço de e-mail válido.',
    }).max(254, { error: 'E-mail muito longo.' }),

    password: z.string({
        error: 'A senha é obrigatória.',
    }).min(1, { error: 'A senha é obrigatória.' }).max(72, { error: 'A senha deve possuir no máximo 72 bytes.' }).refine((value) => new TextEncoder().encode(value).length <= 72, { error: 'A senha deve possuir no máximo 72 bytes.' }),
});
