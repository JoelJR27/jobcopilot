import { z } from 'zod';

export const loginSchema = z.object({
    email: z.email({
        error: 'Informe um endereço de e-mail válido.',
    }),

    password: z.string({
        error: 'A senha é obrigatória.',
    }),
});