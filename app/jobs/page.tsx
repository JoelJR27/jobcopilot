import Link from 'next/link';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeGetRecommendedJobs } from '@/infrastructure/composition/recommended-jobs';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { WORK_MODEL_LABELS } from '@/shared/validation/professional-fields';
import { FeedbackControls } from '@/features/jobs/feedback-controls';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vagas | JobCopilot' };
export default async function JobsPage({ searchParams }: { searchParams?: Promise<{ page?: string }> } = {}) {
    let result: Awaited<ReturnType<ReturnType<typeof makeGetRecommendedJobs>['execute']>> | undefined;
    let errorMessage: string | undefined;
    const raw = (await searchParams)?.page;
    const page = raw && /^\d{1,4}$/.test(raw) ? Math.max(1, Math.min(1000, Number(raw))) : 1;
    try {
        const user = await requireAuthenticatedUser();
        result = await makeGetRecommendedJobs().execute(user.id, page);
    } catch (error) {
        errorMessage = error instanceof UnauthorizedError ? 'Entre na sua conta para acompanhar vagas.' : 'Não foi possível carregar vagas. Tente novamente.';
        if (!(error instanceof UnauthorizedError)) console.error('Erro inesperado ao carregar vagas.');
    }
    if (errorMessage) return <main lang="pt-BR" className="p-8"><p role="alert">{errorMessage}</p></main>;
    return <main lang="pt-BR" className="mx-auto max-w-3xl space-y-5 px-5 py-10">
        <h1 className="text-3xl font-semibold">Vagas recomendadas</h1>
        <p>A pontuação indica compatibilidade com seu perfil e preferências. Ela não representa probabilidade de contratação.</p>
        <Link href="/onboarding" className="underline">Verificar meus primeiros passos</Link>
        {result?.incomplete ? <p role="status">Complete seu <Link href="/profile" className="underline">perfil</Link> e suas <Link href="/preferences" className="underline">preferências</Link> para receber recomendações.</p> : <>
            {!result?.jobs.length && <p role="status">Nenhuma recomendação nesta página. A coleta e o matching são atualizados diariamente quando o agendamento está ativo.</p>}
            {result?.jobs.map((job) => <article key={job.id} className="space-y-2 rounded border p-4">
                <p className="font-semibold">Compatibilidade: {job.score}/100</p><h2 className="text-xl">{job.title}</h2><p>{job.company}</p>
                <p>{job.location ?? 'Localização não informada'} · {job.workModel && job.workModel in WORK_MODEL_LABELS ? WORK_MODEL_LABELS[job.workModel as keyof typeof WORK_MODEL_LABELS] : 'Modelo não informado'}</p>
                <p>Fonte: {job.source} · {job.publishedAt ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(job.publishedAt) : 'Data não informada'}</p>
                <h3 className="font-semibold">Critérios atendidos</h3><ul className="list-inside list-disc">{job.matchedCriteria.map((text) => <li key={text}>{text}</li>)}</ul>
                <h3 className="font-semibold">Critérios ausentes ou não informados</h3><ul className="list-inside list-disc">{job.missingCriteria.map((text) => <li key={text}>{text}</li>)}</ul>
                <a className="underline" href={job.url} target="_blank" rel="noopener noreferrer">Abrir vaga original</a>
                <FeedbackControls matchId={job.id} initial={job.feedback} />
            </article>)}
            <nav aria-label="Páginas de vagas" className="flex gap-4">{page > 1 && <Link href={'/jobs?page=' + (page - 1)}>Anterior</Link>}{result?.jobs.length === 20 && page < 1000 && <Link href={'/jobs?page=' + (page + 1)}>Próxima</Link>}</nav>
        </>}
        <p className="text-sm">Fontes: <a href="https://jobs.lever.co/ciandt" target="_blank" rel="noopener noreferrer" className="underline">CI&amp;T / Lever</a>, <a href="https://jobs.lever.co/swile" target="_blank" rel="noopener noreferrer" className="underline">Swile / Lever</a> e <a href="https://www.arbeitnow.com" target="_blank" rel="noopener noreferrer" className="underline">Arbeitnow</a>.</p>
    </main>;
}
