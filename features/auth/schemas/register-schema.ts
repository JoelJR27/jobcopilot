import { z } from 'zod';

export const registerSchema = z.object({
    email: z.email({
        error: 'Informe um endereço de e-mail válido.',
    }),

    password: z
        .string({
            error: 'A senha é obrigatória.',
        })
        .min(8, {
            error: 'A senha deve possuir pelo menos 8 caracteres.',
        }).regex(/[A-Z]/, { error: "A senha deve conter pelo menos uma letra maiúscula." })
        .regex(/[0-9]/, { error: "A senha deve conter pelo menos um número." })
        .regex(/[^A-Za-z0-9]/, { error: "A senha deve conter pelo menos um caractere especial." }),
});