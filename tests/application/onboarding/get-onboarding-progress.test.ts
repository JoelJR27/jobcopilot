import { describe, expect, it, vi } from 'vitest';
import { GetOnboardingProgress } from '@/application/onboarding/get-onboarding-progress';
import { profileFixture, preferencesFixture } from '@/tests/fixtures/professional-data';

function setup() {
    return {
        resumeRepository: { findByUserId: vi.fn(async (userId: string) => ({ id: 'private-id', userId, fileName: 'private.pdf', storageKey: 'private-storage-key', mimeType: 'application/pdf', fileSize: 10 })) },
        getProfile: { execute: vi.fn(async () => profileFixture as typeof profileFixture | null) },
        getPreferences: { execute: vi.fn(async () => preferencesFixture as typeof preferencesFixture | null) },
    };
}
describe('GetOnboardingProgress', () => {
    it('retorna somente booleans, usando identidade confiável em todos os reads', async () => {
        const dependencies = setup();
        expect(await new GetOnboardingProgress(dependencies).execute('user-a')).toEqual({ account: true, resume: true, profile: true, preferences: true, ready: true });
        expect(dependencies.resumeRepository.findByUserId).toHaveBeenCalledWith('user-a');
        expect(dependencies.getProfile.execute).toHaveBeenCalledWith('user-a');
        expect(dependencies.getPreferences.execute).toHaveBeenCalledWith('user-a');
    });
    it.each(['profile', 'preferences'] as const)('etapa %s ausente bloqueia progresso', async (step) => {
        const dependencies = setup();
        if (step === 'profile') dependencies.getProfile.execute.mockResolvedValue(null);
        else dependencies.getPreferences.execute.mockResolvedValue(null);
        const result = await new GetOnboardingProgress(dependencies).execute('user-a');
        expect(result[step]).toBe(false);
        expect(result.ready).toBe(false);
    });
    it('currículo ausente bloqueia mesmo com perfil/preferências completos', async () => {
        const dependencies = { ...setup(), resumeRepository: { findByUserId: vi.fn(async () => null) } };
        const result = await new GetOnboardingProgress(dependencies).execute('user-a');
        expect(result.resume).toBe(false);
        expect(result.ready).toBe(false);
    });
    it('não considera currículo pertencente a B como progresso de A', async () => {
        const dependencies = setup();
        const other = await dependencies.resumeRepository.findByUserId('user-b');
        dependencies.resumeRepository.findByUserId.mockResolvedValue(other);
        await expect(new GetOnboardingProgress(dependencies).execute('user-a')).rejects.toThrow('Não foi possível verificar as etapas da conta.');
    });
});
