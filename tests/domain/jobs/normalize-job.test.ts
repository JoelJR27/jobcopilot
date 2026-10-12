import { describe, expect, it } from 'vitest';
import { normalizeJob, normalizeJobUrl } from '@/domain/jobs/normalize-job';
import { JobCollectionError } from '@/shared/errors/job-collection-error';
import { collectedJobFixture } from '@/tests/fixtures/collected-jobs';

describe('Normalização de vagas', () => {
    it('normaliza host/porta/fragment/tracking/query sem alterar case do path', () => {
        const input = ' HTTPS://WWW.ARBEITNOW.COM:443/jobs/Developer/?b=2&utm_source=fixture&a=1&fbclid=fixture#apply ';
        expect(normalizeJobUrl(input)).toBe('https://www.arbeitnow.com/jobs/Developer?a=1&b=2');
    });
    it('é determinística e idempotente, preserva params funcionais e repetidos', () => {
        const result = normalizeJobUrl('https://jobs.example.com/Job?id=123&q=a+b&a=1&a=2');
        expect(normalizeJobUrl(result)).toBe(result);
        expect(result).toBe('https://jobs.example.com/Job?a=1&a=2&id=123&q=a+b');
        expect(normalizeJobUrl('https://jobs.example.com/Job?id=456')).not.toBe(normalizeJobUrl('https://jobs.example.com/Job?id=123'));
    });
    it.each(['javascript:alert(1)', 'data:text/html,fixture', 'http://jobs.example.com/job',
        'https://user:private-fixture@jobs.example.com/job', 'https://localhost/job', 'https://foo.local/job',
        'https://127.0.0.1/job', 'https://169.254.169.254/job', 'https://[::1]/job', 'https://10.0.0.1/job',
        'https://jobs.example.com:8443/job', 'not-a-url'])('rejeita URL insegura %s sem expor valores', (url) => {
        expect(() => normalizeJobUrl(url)).toThrow(JobCollectionError);
        expect(() => normalizeJobUrl(url)).toThrow('Não foi possível coletar as vagas.');
    });
    it('normaliza texto e preserva marcação externa como dado não executado', () => {
        const description = '<script>globalThis.privateFixture=true</script> Texto';
        const result = normalizeJob({ ...collectedJobFixture, title: '  Título\n  profissional\u0000 ', description, sourceId: 'forged-source' });
        expect(result.title).toBe('Título profissional');
        expect(result.description).toBe(description);
        expect('sourceId' in result).toBe(false);
        expect('privateFixture' in globalThis).toBe(false);
    });
    it.each([{ title: '' }, { company: '' }, { description: 'a'.repeat(100001) }, { url: 'a'.repeat(2049) }, { publishedAt: new Date('invalid') }])('rejeita dados inválidos %j', (patch) => {
        expect(() => normalizeJob({ ...collectedJobFixture, ...patch })).toThrow(JobCollectionError);
    });
});
