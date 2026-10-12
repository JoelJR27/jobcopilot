import { z } from 'zod';

export const collectedJobSchema = z.object({
    externalId: z.string({ error: 'Identificador externo inválido.' }).trim().min(1, { error: 'Identificador externo vazio.' }).max(512, { error: 'Identificador externo muito longo.' }).optional(),
    url: z.string({ error: 'URL da vaga inválida.' }).trim().max(2048, { error: 'URL da vaga muito longa.' }).pipe(z.url({ error: 'URL da vaga inválida.' })),
    title: z.string({ error: 'Título da vaga inválido.' }).trim().min(1, { error: 'Título da vaga obrigatório.' }).max(500, { error: 'Título da vaga muito longo.' }),
    company: z.string({ error: 'Empresa inválida.' }).trim().min(1, { error: 'Empresa obrigatória.' }).max(500, { error: 'Empresa muito longa.' }),
    description: z.string({ error: 'Descrição inválida.' }).trim().min(1, { error: 'Descrição obrigatória.' }).max(100_000, { error: 'Descrição muito longa.' }),
    location: z.string({ error: 'Localização inválida.' }).trim().max(500, { error: 'Localização muito longa.' }).optional(),
    workModel: z.enum(['REMOTE', 'HYBRID', 'ONSITE'], { error: 'Modelo de trabalho inválido.' }).optional(),
    publishedAt: z.date({ error: 'Data da vaga inválida.' }).min(new Date('1970-01-01'), { error: 'Data da vaga inválida.' }).max(new Date('2100-01-01'), { error: 'Data da vaga inválida.' }).optional(),
}, { error: 'Dados da vaga inválidos.' });

export type CollectedJob = z.infer<typeof collectedJobSchema>;
export type NormalizedJob = CollectedJob & { normalizedUrl: string };
