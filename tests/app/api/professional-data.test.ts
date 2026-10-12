import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getProfile, PUT as putProfile } from '@/app/api/profile/route';
import { GET as getPreferences, PUT as putPreferences } from '@/app/api/preferences/route';
import { GetProfile } from '@/application/profile/get-profile';
import { UpsertProfile } from '@/application/profile/upsert-profile';
import { GetPreferences } from '@/application/preferences/get-preferences';
import { UpsertPreferences } from '@/application/preferences/upsert-preferences';
import { makeGetProfile, makeUpsertProfile } from '@/infrastructure/composition/profile';
import { makeGetPreferences, makeUpsertPreferences } from '@/infrastructure/composition/preferences';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { MAX_ACCOUNT_BODY_SIZE } from '@/infrastructure/http/account-data';
import type { Profile } from '@/domain/profile/profile';
import type { Preferences } from '@/domain/preferences/preferences';
import type { UserRole } from '@/domain/auth/user-role';
import { profileFixture, preferencesFixture } from '@/tests/fixtures/professional-data';

vi.mock('@/infrastructure/auth/session/require-authenticated-user');
vi.mock('@/infrastructure/composition/profile');
vi.mock('@/infrastructure/composition/preferences');

function fakeRepository<T extends object>(records: Map<string, T>) {
    return {
        findByUserId: vi.fn(async (userId: string) => records.get(userId) ?? null),
        upsert: vi.fn(async (userId: string, data: T) => {
            const row = { ...data, id: 'private-id', userId, createdAt: 'private-date', storageKey: 'private-storage-fixture' };
            records.set(userId, row);
            return row;
        }),
    };
}

const cases: { resource: 'profile' | 'preferences'; GET: (request?: Request) => Promise<Response>; PUT: (request: Request) => Promise<Response>; fixture: Profile | Preferences; invalid: object[] }[] = [
    { resource: 'profile', GET: getProfile, PUT: putProfile, fixture: profileFixture, invalid: [
        { headline: '' }, { headline: 'a'.repeat(161) }, { summary: 'a'.repeat(4001) },
        { skills: [] }, { skills: ['a'.repeat(81)] }, { skills: Array(51).fill('skill') },
        { experiences: Array(21).fill('experience') }, { experiences: ['a'.repeat(1001)] },
        { education: Array(21).fill('education') }, { education: ['a'.repeat(501)] },
        { languages: Array(21).fill('language') }, { languages: ['a'.repeat(81)] },
        { roles: [] }, { roles: Array(21).fill('role') }, { roles: ['a'.repeat(101)] },
        { skills: [{ unexpected: ['nested'] }] }, { seniority: 'INVALID' },
    ] },
    { resource: 'preferences', GET: getPreferences, PUT: putPreferences, fixture: preferencesFixture, invalid: [
        { desiredRoles: [] }, { desiredRoles: Array(21).fill('role') }, { desiredRoles: ['a'.repeat(101)] },
        { desiredSkills: Array(51).fill('skill') }, { desiredSkills: ['a'.repeat(81)] },
        { seniority: 'INVALID' }, { workModels: [] }, { workModels: Array(4).fill('REMOTE') },
        { workModels: ['INVALID'] }, { locations: Array(21).fill('place') }, { locations: ['a'.repeat(121)] },
        { locations: { arbitrary: 'json' } }, { workModels: ['HYBRID'], locations: [] },
    ] },
];

describe.each(cases)('/api/$resource', ({ resource, GET, PUT, fixture, invalid }) => {
    let profiles: Map<string, Profile>;
    let preferences: Map<string, Preferences>;
    let profileRepository: ReturnType<typeof fakeRepository<Profile>>;
    let preferenceRepository: ReturnType<typeof fakeRepository<Preferences>>;

    function repo() { return resource === 'profile' ? profileRepository : preferenceRepository; }
    function rows(): Map<string, Profile | Preferences> { return resource === 'profile' ? profiles : preferences; }
    function request(payload: unknown, headers?: HeadersInit) {
        return new Request(`http://localhost:3000/api/${resource}?userId=user-b&id=private-b`, {
            method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload),
        });
    }
    function authenticate(id: string, role: UserRole = 'USER') {
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({ id, role, email: 'fixture@example.com' });
    }

    beforeEach(() => {
        vi.resetAllMocks();
        profiles = new Map(); preferences = new Map();
        profileRepository = fakeRepository(profiles); preferenceRepository = fakeRepository(preferences);
        vi.mocked(makeGetProfile).mockReturnValue(new GetProfile(profileRepository));
        vi.mocked(makeUpsertProfile).mockReturnValue(new UpsertProfile(profileRepository));
        vi.mocked(makeGetPreferences).mockReturnValue(new GetPreferences(preferenceRepository));
        vi.mocked(makeUpsertPreferences).mockReturnValue(new UpsertPreferences(preferenceRepository));
        authenticate('user-a');
    });
    afterEach(() => vi.restoreAllMocks());

    it.each(['GET', 'PUT'])('%s sem sessão retorna 401 sem persistência ou leitura de body', async (method) => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new UnauthorizedError());
        const input = request(fixture);
        const read = vi.spyOn(input.body!, 'getReader');
        const response = method === 'GET' ? await GET(input) : await PUT(input);
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(read).not.toHaveBeenCalled();
        expect(repo().findByUserId).not.toHaveBeenCalled();
        expect(repo().upsert).not.toHaveBeenCalled();
    });

    it('GET ausente retorna null, ignorando query de identidade', async () => {
        rows().set('user-b', fixture);
        const response = await GET(new Request(`http://localhost:3000/api/${resource}?userId=user-b`));
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({ [resource]: null });
        expect(repo().findByUserId).toHaveBeenCalledExactlyOnceWith('user-a');
    });

    it.each<UserRole>(['USER', 'ADMIN'])('%s cria, atualiza e lê somente seu recurso, ignorando campos forjados', async (role) => {
        const owner = `owner-${role}`;
        authenticate(owner, role);
        rows().set('user-b', structuredClone(fixture));
        const forged = { ...fixture, userId: 'user-b', id: 'private-b', role: 'ADMIN', passwordHash: 'private-hash-fixture', storageKey: 'private-storage-fixture' };
        const created = await PUT(request(forged));
        expect(created.status).toBe(200);
        expect(created.headers.get('cache-control')).toBe('no-store');
        expect(await created.json()).toEqual({ [resource]: fixture });
        expect(repo().upsert).toHaveBeenCalledWith(owner, fixture);

        const updated = resource === 'profile' ? { ...fixture, headline: 'Novo título' } : { ...fixture, desiredRoles: ['Novo cargo'] };
        const saved = await PUT(request({ ...updated, userId: 'user-b' }));
        expect(saved.status).toBe(200);
        expect(await saved.json()).toEqual({ [resource]: updated });
        const loaded = await GET(new Request(`http://localhost:3000/api/${resource}?userId=user-b`));
        expect(await loaded.json()).toEqual({ [resource]: updated });
        expect(rows().get('user-b')).toEqual(fixture);
        expect(rows().size).toBe(2);
        expect(repo().findByUserId).toHaveBeenCalledExactlyOnceWith(owner);
    });

    it('operações repetidas não criam mais de um recurso por usuário', async () => {
        await PUT(request(fixture)); await PUT(request(fixture));
        expect(rows().size).toBe(1);
    });

    it.each([null, [], 'invalid', {}])('rejeita payload inválido %j', async (input) => {
        expect((await PUT(request(input))).status).toBe(400);
        expect(repo().upsert).not.toHaveBeenCalled();
    });

    it.each(invalid)('rejeita campos/limites inválidos %j', async (patch) => {
        const response = await PUT(request({ ...fixture, ...patch }));
        expect(response.status).toBe(400);
        expect(repo().upsert).not.toHaveBeenCalled();
        expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('rejeita JSON malformado', async () => {
        const response = await PUT(new Request(`http://localhost:3000/api/${resource}`, {
            method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{invalid',
        }));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'O JSON enviado é inválido.' });
        expect(repo().upsert).not.toHaveBeenCalled();
    });

    it('rejeita Content-Type inválido', async () => {
        expect((await PUT(request(fixture, { 'content-type': 'text/plain' }))).status).toBe(400);
        expect(repo().upsert).not.toHaveBeenCalled();
    });

    it('limita bytes reais mesmo com Content-Length falsificado', async () => {
        const response = await PUT(request({ ...fixture, unused: 'a'.repeat(MAX_ACCOUNT_BODY_SIZE) }, { 'content-length': '1' }));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Os dados enviados excedem o limite de 64 KiB.' });
        expect(repo().upsert).not.toHaveBeenCalled();
    });

    it.each<{ headers: HeadersInit }>([
        { headers: { origin: 'https://other.example' } }, { headers: { origin: 'null' } },
        { headers: { origin: 'http://localhost:3000', 'sec-fetch-site': 'cross-site' } },
    ])('rejeita cross-site antes de ler corpo', async ({ headers }) => {
        const input = request(fixture, headers);
        const read = vi.spyOn(input.body!, 'getReader');
        expect((await PUT(input)).status).toBe(403);
        expect(read).not.toHaveBeenCalled();
        expect(repo().upsert).not.toHaveBeenCalled();
    });

    it('aceita origem same-origin', async () => {
        expect((await PUT(request(fixture, { origin: 'http://localhost:3000' }))).status).toBe(200);
    });

    it.each(['GET', 'PUT'])('falha inesperada em %s retorna 500 e log fixo sem PII', async (method) => {
        const sensitive = 'private-profile-fixture@invalid.example';
        vi.mocked(profileRepository.findByUserId).mockRejectedValue(new Error(sensitive));
        vi.mocked(preferenceRepository.findByUserId).mockRejectedValue(new Error(sensitive));
        vi.mocked(profileRepository.upsert).mockRejectedValue(new Error(sensitive));
        vi.mocked(preferenceRepository.upsert).mockRejectedValue(new Error(sensitive));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const response = method === 'GET' ? await GET() : await PUT(request(fixture));
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Não foi possível processar seus dados. Tente novamente.' });
        expect(log).toHaveBeenCalledExactlyOnceWith('Erro inesperado ao processar dados profissionais.');
        expect(response.headers.get('cache-control')).toBe('no-store');
    });
});
