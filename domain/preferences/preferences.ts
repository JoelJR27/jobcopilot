import { z } from 'zod';
import { professionalList, senioritySchema } from '../../shared/validation/professional-fields.ts';

export const preferencesSchema = z.object({
    desiredRoles: professionalList('Cargos desejados', 20, 100, 1),
    desiredSkills: professionalList('Habilidades desejadas', 50, 80).default([]),
    seniority: senioritySchema,
    workModels: z.array(z.enum(['REMOTE', 'HYBRID', 'ONSITE'], { error: 'Selecione um modelo de trabalho válido.' }), {
        error: 'Modelos de trabalho: informe uma lista.',
    }).min(1, { error: 'Selecione pelo menos um modelo de trabalho.' })
        .max(3, { error: 'Selecione no máximo três modelos de trabalho.' })
        .transform((models) => [...new Set(models)]),
    locations: professionalList('Localizações', 20, 120).default([]),
}, { error: 'Informe um objeto com as preferências de vagas.' }).superRefine((data, context) => {
    if (data.workModels.some((model) => model !== 'REMOTE') && data.locations.length === 0) {
        context.addIssue({ code: 'custom', path: ['locations'], message: 'Informe pelo menos uma localização para vagas presenciais ou híbridas.' });
    }
});

export type Preferences = z.infer<typeof preferencesSchema>;
