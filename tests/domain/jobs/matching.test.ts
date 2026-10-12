import { describe, expect, it } from 'vitest';
import { brazilEligibility } from '@/domain/jobs/brazil-eligibility';
import { matchJob, MATCH_WEIGHTS, type MatchableJob } from '@/domain/jobs/match-job';
import { profileFixture, preferencesFixture } from '@/tests/fixtures/professional-data';
const preferences = { ...preferencesFixture, desiredRoles: ['Developer'], desiredSkills: ['TypeScript', 'React'] };
const job: MatchableJob = { id: 'one', title: 'Mid Developer', description: 'TypeScript React', location: 'Brazil', workModel: 'REMOTE' };
describe('Brasil-first e matching v1', () => {
    it('pesos explícitos somam 100 e forte tem 100', () => {
        expect(Object.values(MATCH_WEIGHTS).reduce<number>((a, b) => a + b, 0)).toBe(100);
        expect(matchJob(profileFixture, preferences, job)?.score).toBe(100);
    });
    it('parcial pontua proporcionalmente skills e fraco tem só geografia', () => {
        expect(matchJob(profileFixture, preferences, { ...job, description: 'TypeScript' })?.score).toBe(83);
        expect(matchJob(profileFixture, preferences, { ...job, title: 'Outra vaga', description: 'Nada correspondente', workModel: null })?.score).toBe(10);
    });
    it('senioridade/modelo/localização incompatíveis não ganham pontos', () => {
        const result = matchJob(profileFixture, { ...preferences, locations: ['Campinas'] }, { ...job, title: 'Senior Developer', workModel: 'ONSITE', location: 'Recife, Brasil' });
        expect(result?.score).toBe(65); expect(result?.missingCriteria).toHaveLength(3);
    });
    it.each(['Brazil', 'Brasil', 'BR', 'São Paulo, SP', 'Campinas, SP', 'Minas Gerais'])('reconhece %s', (location) => {
        expect(brazilEligibility({ location, workModel: 'ONSITE' })).toMatchObject({ eligible: true, rank: 0 });
    });
    it.each(['Remote Brazil', 'Remote - Brasil', 'BR'])('remoto Brasil %s', (location) => {
        expect(brazilEligibility({ location, workModel: 'REMOTE' })).toMatchObject({ eligible: true, rank: 1 });
    });
    it.each(['Worldwide remote', 'Remote - LATAM', 'Remote Latin America'])('remoto explícito %s', (location) => {
        expect(brazilEligibility({ location, workModel: 'REMOTE' })).toMatchObject({ eligible: true, rank: 2 });
    });
    it.each(['Remote', 'Berlin', 'Europe remote', 'Germany', 'London'])('não presume Brasil para %s', (location) => {
        expect(matchJob(profileFixture, preferences, { ...job, location, description: 'Our customer is in Brazil.' })).toBeNull();
    });
    it('token exato evita Java ganhar ponto por JavaScript', () => {
        expect(matchJob(profileFixture, { ...preferences, desiredSkills: ['Java'] }, { ...job, description: 'JavaScript' })?.score).toBe(65);
    });
    it('sem desiredSkills usa as habilidades do Profile', () => {
        expect(matchJob(profileFixture, { ...preferences, desiredSkills: [] }, job)?.score).toBe(100);
    });
});
