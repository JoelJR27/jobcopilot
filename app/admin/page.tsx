import Link from 'next/link';
import { requireAdminUser } from '@/infrastructure/auth/session/require-admin-user';
import { makeGetOperations } from '@/infrastructure/composition/admin-operations';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { ForbiddenError } from '@/shared/errors/forbidden-error';
import { SourceToggle } from '@/features/admin/source-toggle';
export const dynamic = 'force-dynamic';
export default async function AdminPage() {
    let overview: Awaited<ReturnType<ReturnType<typeof makeGetOperations>['execute']>> | undefined; let message: string | undefined;
    try { await requireAdminUser(); overview = await makeGetOperations().execute(); }
    catch (error) {
        message = error instanceof UnauthorizedError ? 'Entre na sua conta.' : error instanceof ForbiddenError ? 'Acesso não permitido.' : 'Não foi possível carregar operações.';
        if (!(error instanceof UnauthorizedError) && !(error instanceof ForbiddenError)) console.error('Falha ao carregar operações.');
    }
    if (message) return <main className="p-8"><p role="alert">{message}</p></main>;
    return <main lang="pt-BR" className="mx-auto max-w-3xl space-y-4 px-5 py-10"><h1 className="text-3xl">Operações</h1><Link className="underline" href="/jobs">Minhas vagas</Link>
        <dl><dt>Usuários</dt><dd>{overview?.users}</dd><dt>Vagas</dt><dd>{overview?.jobs}</dd><dt>Matches, incluindo histórico oculto</dt><dd>{overview?.matches}</dd><dt>Feedbacks</dt><dd>{overview?.feedbacks}</dd></dl>
        <h2 className="text-xl">Fontes</h2>{overview?.sources.map((source) => <section key={source.id} className="space-y-2 rounded border p-4"><h3>{source.name}</h3><p>{source.active ? 'Ativa' : 'Inativa'}</p><SourceToggle id={source.id} initial={source.active} /></section>)}
        <p>Execuções do pipeline são registradas nos logs operacionais. Última execução persistida não está disponível.</p>
    </main>;
}
