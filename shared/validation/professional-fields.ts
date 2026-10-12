import { z } from 'zod';

export const SENIORITY_LABELS = {
    INTERN: 'Estágio', JUNIOR: 'Júnior', MID: 'Pleno', SENIOR: 'Sênior', LEAD: 'Liderança',
} as const;
export const WORK_MODEL_LABELS = { REMOTE: 'Remoto', HYBRID: 'Híbrido', ONSITE: 'Presencial' } as const;

export const senioritySchema = z.enum(['INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD'], {
    error: 'Selecione uma senioridade válida.',
});

export function professionalText(label: string, max: number) {
    return z.string({ error: `${label}: informe um texto.` }).trim()
        .max(max, { error: `${label}: use no máximo ${max} caracteres.` });
}

export function professionalList(label: string, maxItems: number, maxLength: number, minItems = 0) {
    return z.array(professionalText(label, maxLength).min(1, { error: `${label}: não inclua itens vazios.` }), {
        error: `${label}: informe uma lista de textos.`,
    }).min(minItems, { error: `${label}: informe pelo menos ${minItems} item.` })
        .max(maxItems, { error: `${label}: inclua no máximo ${maxItems} itens.` })
        .transform((items) => [...new Set(items)]);
}
