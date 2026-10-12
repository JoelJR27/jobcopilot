import Link from 'next/link';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeGetOnboardingProgress } from '@/infrastructure/composition/onboarding';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import ResumeStep from '@/features/onboarding/resume-step';
import type { GetOnboardingProgress } from '@/application/onboarding/get-onboarding-progress';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Primeiros passos | JobCopilot' };

export default async function OnboardingPage() {
    let progress: Awaited<ReturnType<GetOnboardingProgress['execute']>>;
    try {
        const user = await requireAuthenticatedUser();
        progress = await makeGetOnboardingProgress().execute(user.id);
    } catch (error) {
        if (error instanceof UnauthorizedError) return <main lang="pt-BR" className="p-8"><p role="alert">Entre na sua conta para acompanhar seus primeiros passos.</p></main>;
        console.error('Erro inesperado ao carregar progresso de onboarding.');
        return <main lang="pt-BR" className="p-8"><p role="alert">Não foi possível carregar seu progresso. Tente novamente.</p></main>;
    }
    return <main lang="pt-BR" className="mx-auto max-w-2xl space-y-6 px-5 py-10 text-slate-900">
            <h1 className="text-3xl font-semibold">Primeiros passos</h1>
            <p>Complete suas informações para preparar suas recomendações de vagas.</p>
            <ul className="space-y-5">
                <li>[✓] Conta criada</li>
                <li>[{progress.resume ? '✓' : ' '}] Currículo {progress.resume ? 'enviado' : 'pendente'}{!progress.resume && <ResumeStep />}</li>
                <li>[{progress.profile ? '✓' : ' '}] Perfil profissional — <Link className="text-blue-800 underline" href="/profile">Completar ou editar perfil</Link></li>
                <li>[{progress.preferences ? '✓' : ' '}] Preferências — <Link className="text-blue-800 underline" href="/preferences">Completar ou editar preferências</Link></li>
            </ul>
            {progress.ready ? <Link className="inline-block rounded bg-blue-800 px-4 py-2 text-white" href="/jobs">Continuar para vagas</Link>
                : <p>Complete currículo, perfil e preferências para continuar.</p>}
            <p className="text-sm text-slate-600">Fonte inicial de vagas: <a href="https://www.arbeitnow.com" target="_blank" rel="noopener noreferrer" className="underline">Arbeitnow</a>.</p>
    </main>;
}
