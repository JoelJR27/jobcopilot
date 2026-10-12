import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { PrismaJobRepository } from '@/infrastructure/database/prisma/repositories/job-repository';
import { PrismaJobSourceRepository } from '@/infrastructure/database/prisma/repositories/job-source-repository';
import { normalizeJob } from '@/domain/jobs/normalize-job';
import { collectedJobFixture } from '@/tests/fixtures/collected-jobs';

describe('Repositories de coleta', () => {
    it('insere allowlist e sourceId do caso de uso com defesa nas constraints', async () => {
        const createMany = vi.fn(async () => ({ count: 1 }));
        const client = { job: { createMany } } as unknown as PrismaClient;
        const job = { ...normalizeJob(collectedJobFixture), sourceId: 'forged', id: 'forged-id', status: 'forged' };
        expect(await new PrismaJobRepository(client).insertOrIgnore('source-a', [job])).toBe(1);
        expect(createMany).toHaveBeenCalledWith({ data: [{ sourceId: 'source-a', externalId: collectedJobFixture.externalId,
            url: collectedJobFixture.url, normalizedUrl: collectedJobFixture.url, title: collectedJobFixture.title,
            company: collectedJobFixture.company, description: collectedJobFixture.description, location: collectedJobFixture.location,
            workModel: 'REMOTE', publishedAt: collectedJobFixture.publishedAt }], skipDuplicates: true });
    });
    it('ensure fonte usa chave única sem reativar fonte desabilitada', async () => {
        const upsert = vi.fn(async () => ({ id: 'source-a', active: false }));
        const client = { jobSource: { upsert } } as unknown as PrismaClient;
        expect(await new PrismaJobSourceRepository(client).ensure({ name: 'Arbeitnow', baseUrl: 'https://www.arbeitnow.com' })).toEqual({ id: 'source-a', active: false });
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { name: 'Arbeitnow' }, update: { baseUrl: 'https://www.arbeitnow.com' } }));
    });
});
