import { z } from 'zod';
import { professionalList, professionalText, senioritySchema } from '../../shared/validation/professional-fields.ts';

export const profileSchema = z.object({
    headline: professionalText('Título profissional', 160).min(1, { error: 'Informe seu título profissional.' }),
    summary: professionalText('Resumo', 4000).default(''),
    skills: professionalList('Habilidades', 50, 80, 1),
    experiences: professionalList('Experiências', 20, 1000).default([]),
    education: professionalList('Formação', 20, 500).default([]),
    languages: professionalList('Idiomas', 20, 80).default([]),
    roles: professionalList('Cargos', 20, 100, 1),
    seniority: senioritySchema,
}, { error: 'Informe um objeto com os dados do perfil.' });

export type Profile = z.infer<typeof profileSchema>;
