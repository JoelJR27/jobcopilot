import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ProfilePage from '@/app/profile/page';
import PreferencesPage from '@/app/preferences/page';
import ProfileEditor from '@/features/profile/profile-editor';
import PreferencesEditor from '@/features/preferences/preferences-editor';
import { ListField, splitLines } from '@/features/account/editor-fields';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';

vi.mock('@/infrastructure/auth/session/require-authenticated-user');

describe('Páginas profissionais', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });

    it.each([ProfilePage, PreferencesPage])('bloqueia formulário sem sessão', async (page) => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new UnauthorizedError());
        const html = renderToStaticMarkup(await page());
        expect(html).toContain('Entre na sua conta');
        expect(html).not.toContain('<form');
    });

    it.each([ProfilePage, PreferencesPage])('falha de auth mostra erro genérico e log fixo', async (page) => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new Error('private-fixture@example.com'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const html = renderToStaticMarkup(await page());
        expect(html).toContain('Não foi possível');
        expect(html).not.toContain('private-fixture');
        expect(JSON.stringify(log.mock.calls)).not.toContain('private-fixture');
    });

    it.each(['USER', 'ADMIN'] as const)('USER/ADMIN têm as mesmas telas: %s', async (role) => {
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({ id: 'user-a', email: 'fixture@example.com', role });
        const profile = renderToStaticMarkup(await ProfilePage());
        const preferences = renderToStaticMarkup(await PreferencesPage());
        expect(profile).toContain('Carregando perfil');
        expect(preferences).toContain('Carregando preferências');
        expect(profile + preferences).not.toContain('fixture@example.com');
        expect(profile + preferences).not.toContain('user-a');
    });

    it('renderiza loading e navegação sem esperar dados privados', () => {
        const html = renderToStaticMarkup(<ProfileEditor />) + renderToStaticMarkup(<PreferencesEditor />);
        expect(html).toContain('role="status"');
        expect(html).toContain('href="/profile"');
        expect(html).toContain('href="/preferences"');
    });

    it('listas são texto limitado e não interpretam HTML', () => {
        const html = renderToStaticMarkup(<ListField id="skills" label="Habilidades" maxItems={50} maxLength={80}
            value={'<script>alert("fixture")</script>'} onChange={() => {}} />);
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('maxLength="4050"');
        expect(splitLines(' TypeScript\r\n \r\nReact ')).toEqual(['TypeScript', 'React']);
    });
});
