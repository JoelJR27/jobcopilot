import PreferencesEditor from '@/features/preferences/preferences-editor';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';

export const metadata = { title: 'Preferências | JobCopilot' };
export const dynamic = 'force-dynamic';

export default async function PreferencesPage() {
    try { await requireAuthenticatedUser(); } catch (error) {
        if (error instanceof UnauthorizedError) return <main lang="pt-BR" className="p-8"><h1>Preferências</h1><p role="alert">Entre na sua conta para editar suas preferências.</p></main>;
        console.error('Erro inesperado ao abrir a página de preferências.');
        return <main lang="pt-BR" className="p-8"><p role="alert">Não foi possível abrir suas preferências. Tente novamente.</p></main>;
    }
    return <PreferencesEditor />;
}
