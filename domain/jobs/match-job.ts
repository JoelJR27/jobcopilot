import type { Profile } from '../profile/profile';
import type { Preferences } from '../preferences/preferences';
import { brazilEligibility, fold } from './brazil-eligibility.ts';

export const MATCH_WEIGHTS = { role: 30, skills: 35, seniority: 15, workModel: 10, location: 10 } as const;
export interface MatchableJob {
    id: string; title: string; description: string; location: string | null; workModel: 'REMOTE' | 'HYBRID' | 'ONSITE' | null;
}
export interface MatchResult { score: number; geographyRank: number; matchedCriteria: string[]; missingCriteria: string[] }
function contains(text: string, phrase: string): boolean {
    // Tokens delimitados: Java não corresponde a JavaScript. Sem regex gerada por input.
    const normalized = fold(phrase);
    let offset = text.indexOf(normalized);
    while (offset >= 0) {
        const before = text[offset - 1]; const after = text[offset + normalized.length];
        if ((!before || !/[a-z0-9]/.test(before)) && (!after || !/[a-z0-9]/.test(after))) return true;
        offset = text.indexOf(normalized, offset + 1);
    }
    return false;
}
function seniorities(title: string): string[] {
    const rules: [string, RegExp][] = [
        ['INTERN', /\b(estagio|estagiario|intern|internship)\b/], ['JUNIOR', /\b(junior|jr)\b/],
        ['MID', /\b(pleno|mid|midlevel)\b/], ['SENIOR', /\b(senior|sr)\b/], ['LEAD', /\b(lead|lider|master|principal|staff)\b/],
    ];
    return rules.filter(([, expression]) => expression.test(title)).map(([level]) => level);
}
export function matchJob(profile: Profile, preferences: Preferences, job: MatchableJob): MatchResult | null {
    const geography = brazilEligibility(job);
    if (!geography.eligible) return null;
    const title = fold(job.title); const text = fold(job.title + ' ' + job.description);
    const matchedCriteria: string[] = []; const missingCriteria: string[] = []; let score = 0;
    const criterion = (ok: boolean, points: number, yes: string, no: string) => {
        if (ok) { score += points; matchedCriteria.push(yes); } else missingCriteria.push(no);
    };
    const roles = preferences.desiredRoles.length ? preferences.desiredRoles : profile.roles;
    criterion(roles.some((role) => contains(title, role)), MATCH_WEIGHTS.role, 'Cargo desejado presente no título', 'Cargo desejado não identificado no título');
    const skills = [...new Set((preferences.desiredSkills.length ? preferences.desiredSkills : profile.skills).map(fold))];
    const found = skills.filter((skill) => contains(text, skill));
    score += skills.length ? MATCH_WEIGHTS.skills * found.length / skills.length : 0;
    if (found.length) matchedCriteria.push('Habilidades identificadas: ' + found.join(', '));
    const missing = skills.filter((skill) => !found.includes(skill));
    if (missing.length) missingCriteria.push('Habilidades não identificadas: ' + missing.join(', '));
    criterion(seniorities(title).includes(preferences.seniority), MATCH_WEIGHTS.seniority, 'Senioridade desejada identificada', 'Senioridade desejada incompatível ou não informada');
    criterion(job.workModel !== null && preferences.workModels.includes(job.workModel), MATCH_WEIGHTS.workModel, 'Modelo de trabalho desejado', 'Modelo de trabalho incompatível ou não informado');
    const locationMatches = preferences.locations.length === 0 || preferences.locations.some((place) => contains(fold(job.location ?? ''), place));
    criterion(locationMatches, MATCH_WEIGHTS.location, geography.label, 'Elegível no Brasil, mas localização desejada não identificada');
    if (!locationMatches) matchedCriteria.push(geography.label);
    return { score: Math.round(score), geographyRank: geography.rank, matchedCriteria, missingCriteria };
}
