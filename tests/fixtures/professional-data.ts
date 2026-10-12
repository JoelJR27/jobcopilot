import type { Profile } from '@/domain/profile/profile';
import type { Preferences } from '@/domain/preferences/preferences';

export const profileFixture: Profile = {
    headline: 'Desenvolvimento de software', summary: 'Experiência com aplicações web.',
    skills: ['TypeScript'], experiences: ['Desenvolvimento de aplicações'], education: ['Ciência da Computação'],
    languages: ['Português fluente'], roles: ['Pessoa desenvolvedora'], seniority: 'MID',
};
export const preferencesFixture: Preferences = {
    desiredRoles: ['Pessoa desenvolvedora'], desiredSkills: ['TypeScript'], seniority: 'MID',
    workModels: ['REMOTE'], locations: [],
};
