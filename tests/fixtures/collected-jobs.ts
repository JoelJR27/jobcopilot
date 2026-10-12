import type { CollectedJob } from '@/domain/jobs/collected-job';

export const collectedJobFixture: CollectedJob = {
    externalId: 'developer-fixture', url: 'https://www.arbeitnow.com/jobs/developer-fixture',
    title: 'Pessoa desenvolvedora', company: 'Empresa de teste', description: 'Desenvolvimento de software.',
    location: 'Berlin', workModel: 'REMOTE', publishedAt: new Date('2026-10-01T12:00:00Z'),
};
export const arbeitnowFeedFixture = { data: [{
    slug: 'developer-fixture', url: collectedJobFixture.url, title: collectedJobFixture.title,
    company_name: collectedJobFixture.company, description: collectedJobFixture.description,
    location: 'Berlin', remote: true, created_at: 1790856000,
}] };
