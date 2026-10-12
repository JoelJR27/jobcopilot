import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import OnboardingPage from '@/app/onboarding/page';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeGetOnboardingProgress } from '@/infrastructure/composition/onboarding';
import { GetOnboardingProgress } from '@/application/onboarding/get-onboarding-progress';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { profileFixture, preferencesFixture } from '@/tests/fixtures/professional-data';

vi.mock('@/infrastructure/auth/session/require-authenticated-user');
vi.mock('@/infrastructure/composition/onboarding');
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('Onboarding mínimo', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });
    it('sem sessão não consulta progresso nem oferece upload', async () => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new UnauthorizedError());
        const html = renderToStaticMarkup(await OnboardingPage());
        expect(html).toContain('Entre na sua conta');
        expect(html).not.toContain('type="file"');
        expect(makeGetOnboardingProgress).not.toHaveBeenCalled();
    });
    it.each(['USER', 'ADMIN'] as const)('%s incompleto tem links e upload sem dados privados', async (role) => {
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({ id: 'user-a', role, email: 'private-fixture@example.com' });
        const execute = vi.spyOn(GetOnboardingProgress.prototype, 'execute').mockResolvedValue({ account: true, resume: false, profile: false, preferences: false, ready: false });
        const useCase = new GetOnboardingProgress({ resumeRepository: { findByUserId: async () => null }, getProfile: { execute: async () => null }, getPreferences: { execute: async () => null } });
        vi.mocked(makeGetOnboardingProgress).mockReturnValue(useCase);
        const html = renderToStaticMarkup(await OnboardingPage());
        expect(execute).toHaveBeenCalledWith('user-a');
        expect(html).toContain('href="/profile"');
        expect(html).toContain('href="/preferences"');
        expect(html).toContain('type="file"');
        expect(html).not.toContain('href="/jobs"');
        expect(html).not.toContain('private-fixture');
        expect(html).not.toContain('user-a');
    });
    it('completo permite continuar para destino /jobs válido', async () => {
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({ id: 'user-a', role: 'USER', email: 'private-fixture@example.com' });
        vi.mocked(makeGetOnboardingProgress).mockReturnValue(new GetOnboardingProgress({
            resumeRepository: { findByUserId: async (userId) => ({ id: 'private-id', userId, fileName: 'private.pdf', storageKey: 'private-key', mimeType: 'application/pdf', fileSize: 10 }) },
            getProfile: { execute: async () => profileFixture }, getPreferences: { execute: async () => preferencesFixture },
        }));
        const html = renderToStaticMarkup(await OnboardingPage());
        expect(html).toContain('href="/jobs"');
        expect(html).not.toContain('private-key');
        expect(html).not.toContain('private.pdf');
    });
    it('erro inesperado não vaza dados privados nem exception raw', async () => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new Error('private-cookie-fixture'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const html = renderToStaticMarkup(await OnboardingPage());
        expect(html).toContain('Não foi possível carregar seu progresso');
        expect(html).not.toContain('private-cookie-fixture');
        expect(log).toHaveBeenCalledExactlyOnceWith('Erro inesperado ao carregar progresso de onboarding.');
    });
});
