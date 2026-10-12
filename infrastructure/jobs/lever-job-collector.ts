import { z } from 'zod';
import type { ExecutionContext } from '@/application/operations/execution-context';
import type { JobCollector } from '@/application/jobs/ports/job-collector';
import { readSourceJson } from './read-source-json.ts';
import { LEVER_SOURCES } from '../../shared/config/job-source.ts';
import { normalizeJob } from '../../domain/jobs/normalize-job.ts';
import { JobCollectionError } from '../../shared/errors/job-collection-error.ts';
const text = (max: number) => z.string({ error: 'Texto externo inválido.' }).max(max, { error: 'Texto externo excessivo.' });
const schema = z.array(z.object({
    id: text(512).min(1, { error: 'Identificador obrigatório.' }), text: text(500), descriptionPlain: text(100000),
    additionalPlain: text(10000).optional(), categories: z.object({ location: text(500) }),
    country: text(2).optional(), workplaceType: z.enum(['remote', 'hybrid', 'onsite', 'unspecified'], { error: 'Modelo inválido.' }).optional(),
    hostedUrl: text(2048).pipe(z.url({ error: 'URL inválida.' })),
    createdAt: z.number({ error: 'Data inválida.' }).int({ error: 'Data inválida.' }).min(0, { error: 'Data inválida.' }).max(4102444800000, { error: 'Data inválida.' }),
    lists: z.array(z.object({ text: text(500), content: text(50000) })).max(20, { error: 'Itens excessivos.' }).optional(),
})).max(1000, { error: 'Vagas excessivas.' });
export class LeverJobCollector implements JobCollector {
    private readonly fetcher: typeof fetch;
    private readonly source: (typeof LEVER_SOURCES)[keyof typeof LEVER_SOURCES];
    constructor(board: keyof typeof LEVER_SOURCES, fetcher: typeof fetch = fetch) {
        if (!Object.hasOwn(LEVER_SOURCES, board)) throw new JobCollectionError('SOURCE_NOT_CONFIGURED');
        this.source = LEVER_SOURCES[board]; this.fetcher = fetcher;
    }
    async collect(context?: ExecutionContext) {
        const result = schema.safeParse(await readSourceJson('https://api.lever.co/v0/postings/' + this.source.boardToken + '?mode=json', this.fetcher, context));
        if (!result.success) throw new JobCollectionError('SOURCE_INVALID_PAYLOAD');
        const rows = result.data.filter((row) => [row.descriptionPlain, ...(row.lists ?? []).map((list) => list.text + ': ' + list.content), row.additionalPlain ?? ''].join(' ').trim().length > 0);
        if (rows.length !== result.data.length) console.info(JSON.stringify({ event: 'source_incomplete_posts_skipped', source: this.source.name, count: result.data.length - rows.length }));
        return rows.map((row) => {
            const url = new URL(row.hostedUrl);
            if (url.hostname !== 'jobs.lever.co' || !url.pathname.startsWith('/' + this.source.boardToken + '/')) throw new JobCollectionError('SOURCE_INVALID_JOB_URL');
            // country é evidência estruturada; BR não é inferido por ser empresa brasileira.
            const location = row.country === 'BR' ? row.categories.location + ', Brasil' : row.categories.location;
            const workModel = row.workplaceType === 'remote' ? 'REMOTE' : row.workplaceType === 'hybrid' ? 'HYBRID' : row.workplaceType === 'onsite' ? 'ONSITE' : undefined;
            const description = [row.descriptionPlain, ...(row.lists ?? []).map((list) => list.text + ': ' + list.content), row.additionalPlain ?? ''].join(' ');
            return normalizeJob({ externalId: row.id, url: row.hostedUrl, title: row.text, company: this.source.company, description, location, workModel, publishedAt: new Date(row.createdAt) });
        });
    }
}
