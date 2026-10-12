import ProfileEditor from '@/features/profile/profile-editor';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';

export const metadata = { title: 'Meu perfil | JobCopilot' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
    try { await requireAuthenticatedUser(); } catch (error) {
        if (error instanceof UnauthorizedError) return <main lang="pt-BR" className="p-8"><h1>Meu perfil</h1><p role="alert">Entre na sua conta para editar seu perfil.</p></main>;
        console.error('Erro inesperado ao abrir a página de perfil.');
        return <main lang="pt-BR" className="p-8"><p role="alert">Não foi possível abrir seu perfil. Tente novamente.</p></main>;
    }
    return <ProfileEditor />;
}
