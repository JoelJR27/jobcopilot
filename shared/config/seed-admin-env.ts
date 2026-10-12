import { z } from 'zod';

const seedAdminSchema = z.object({
    SEED_ADMIN_EMAIL: z.string({ error: 'Informe o e-mail do administrador.' })
        .trim().toLowerCase()
        .max(254, { error: 'O e-mail deve possuir no máximo 254 caracteres.' })
        .pipe(z.email({ error: 'Informe um e-mail válido para o administrador.' })),
    SEED_ADMIN_PASSWORD: z.string({ error: 'Informe a senha do administrador.' })
        .min(8, { error: 'A senha deve possuir pelo menos 8 caracteres.' })
        .max(72, { error: 'A senha deve possuir no máximo 72 bytes.' })
        .refine((value) => new TextEncoder().encode(value).byteLength <= 72, {
            error: 'A senha deve possuir no máximo 72 bytes.',
        })
        .regex(/[A-Z]/, { error: 'A senha deve conter pelo menos uma letra maiúscula.' })
        .regex(/[0-9]/, { error: 'A senha deve conter pelo menos um número.' })
        .regex(/[^A-Za-z0-9]/, { error: 'A senha deve conter pelo menos um caractere especial.' }),
});

export function parseSeedAdminEnv(input: {
    SEED_ADMIN_EMAIL?: string;
    SEED_ADMIN_PASSWORD?: string;
}) {
    const result = seedAdminSchema.safeParse(input);

    if (!result.success) {
        // Não propagar ZodError ou valores de ambiente para logs/CLI.
        throw new Error('Configure SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD válidos. A senha deve ter de 8 a 72 bytes, letra maiúscula, número e caractere especial.');
    }

    return result.data;
}
