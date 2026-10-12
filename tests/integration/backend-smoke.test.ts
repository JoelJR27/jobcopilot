import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { backendTestDatabase } from './backend-test-database';
import { profileFixture, preferencesFixture } from '@/tests/fixtures/professional-data';
import { RunDailyJobPipeline } from '@/application/jobs/run-daily-job-pipeline';
import { CollectJobs } from '@/application/jobs/collect-jobs';
import { PrismaMatchingRepository } from '@/infrastructure/database/prisma/repositories/matching-repository';
import { PrismaJobRepository } from '@/infrastructure/database/prisma/repositories/job-repository';
import { PrismaJobSourceRepository } from '@/infrastructure/database/prisma/repositories/job-source-repository';
import { CleanupOrphanedResumes } from '@/application/resume/cleanup-orphaned-resumes';
import { RunResumeGc } from '@/application/resume/run-resume-gc';
import { PrismaResumeRepository } from '@/infrastructure/database/prisma/repositories/resume-repository';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';
import { POST as upload } from '@/app/api/resumes/route';
import { GET as getProfile, PUT as putProfile } from '@/app/api/profile/route';
import { GET as getPreferences, PUT as putPreferences } from '@/app/api/preferences/route';
import { GET as jobs } from '@/app/api/jobs/route';
import { PUT as feedback } from '@/app/api/job-matches/[id]/feedback/route';
import { GET as operations } from '@/app/api/admin/operations/route';
import { PUT as sourceToggle } from '@/app/api/admin/job-sources/[id]/route';
import { GET as cron } from '@/app/api/internal/jobs/run/route';
import { GET as gc } from '@/app/api/internal/resumes/gc/route';
const state = vi.hoisted(() => ({ client: undefined as unknown, session: '', pipeline: undefined as unknown, cleanup: undefined as unknown, failDelete: false,
    versions: [] as { key: string; versionId: string; isDeleteMarker: boolean; lastModified: Date }[] }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => state.session ? { value: state.session } : undefined }) }));
vi.mock('@/infrastructure/database/prisma', () => ({ get prisma() { return state.client; } }));
vi.mock('@/infrastructure/database/prisma/client', () => ({ get prisma() { return state.client; } }));
vi.mock('@/infrastructure/composition/daily-job-pipeline', () => ({ makeDailyJobPipeline: () => ({ execute: (options: object) => (state.pipeline as RunDailyJobPipeline).execute(options), disconnect: async () => {} }) }));
vi.mock('@/infrastructure/composition/resume-gc', () => ({ makeRunResumeGc: () => state.cleanup }));
vi.mock('@/infrastructure/storage/b2/b2-resume-storage', () => ({ B2ResumeStorage: class {
    async save(input: { key: string }) { state.versions.push({ key: input.key, versionId: String(state.versions.length), isDeleteMarker: false, lastModified: new Date() }); }
    async get() { return null; }
    async delete() { /* simula semântica versionada B2: GC remove versões órfãs depois */ }
    async listVersions() { return [...state.versions]; }
    async deleteVersion(key: string, versionId: string) { if (state.failDelete) throw new Error('synthetic-body-secret'); state.versions = state.versions.filter((row) => row.key !== key || row.versionId !== versionId); }
} }));
const request = (path: string, method = 'GET', body?: unknown) => new Request('https://app.example' + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const internal = (path: string, authorized = true) => new Request('https://app.example' + path, { headers: authorized ? { Authorization: 'Bearer ' + process.env.INTERNAL_JOBS_SECRET } : {} });
describe.skipIf(process.env.JOBCOPILOT_DB_TESTS !== '1')('Smoke backend USER A / USER B / ADMIN isolado', () => {
    let db: Awaited<ReturnType<typeof backendTestDatabase>>;
    const accounts: { id: string; session: string }[] = [];
    beforeAll(async () => {
        db = await backendTestDatabase(); state.client = db.client;
        vi.stubEnv('RATE_LIMIT_MODE', 'postgres'); vi.stubEnv('RATE_LIMIT_KEY_SECRET', 'synthetic-rate-test-only-'.repeat(3));
        vi.stubEnv('INTERNAL_JOBS_SECRET', 'synthetic-cron-test-only-'.repeat(3)); vi.stubEnv('CRON_SECRET', process.env.INTERNAL_JOBS_SECRET!);
        const repo = new PrismaMatchingRepository(db.client, db.schema);
        state.pipeline = new RunDailyJobPipeline({ repository: repo, guard: { run: async (task) => task() }, collectors: [{ name: 'Smoke fixture', collect: new CollectJobs({
            source: { name: 'Smoke fixture', baseUrl: 'https://jobs.lever.co/ciandt' }, sourceRepository: new PrismaJobSourceRepository(db.client), repository: new PrismaJobRepository(db.client),
            collector: { collect: async () => [{ externalId: 'smoke', url: 'https://jobs.lever.co/ciandt/smoke', title: 'Pessoa desenvolvedora TypeScript pleno', company: 'Fixture', description: '<script>untrusted fixture</script>', location: 'Remote Brazil', workModel: 'REMOTE' }] },
        }) }] });
        const { B2ResumeStorage } = await import('@/infrastructure/storage/b2/b2-resume-storage');
        state.cleanup = new RunResumeGc({ cleanup: new CleanupOrphanedResumes({ resumeRepository: new PrismaResumeRepository(), resumeStorage: new B2ResumeStorage() }), guard: { run: async (task) => task() } });
    }, 20000);
    afterAll(async () => { state.session = ''; vi.unstubAllEnvs(); await db?.close(); vi.restoreAllMocks(); });
    it('rejeita sem sessão e cron sem Bearer; cadastra/loga três contas sem mass assignment', async () => {
        for (const response of [await getProfile(), await getPreferences(), await jobs(request('/api/jobs')), await operations(), await me()]) {
            expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('no-store');
        }
        expect((await cron(internal('/api/internal/jobs/run', false))).status).toBe(401);
        expect((await gc(internal('/api/internal/resumes/gc', false))).status).toBe(401);
        for (const name of ['a', 'b', 'admin']) {
            const payload = { email: name + '@example.com', password: 'SyntheticOnly9!', role: 'ADMIN', userId: 'forged' };
            const created = await register(request('/api/auth/register', 'POST', payload));
            expect(created.status).toBe(201); const publicBody = await created.json(); expect(publicBody).not.toHaveProperty('email');
            const user = await db.client.user.findUniqueOrThrow({ where: { email: payload.email } }); expect(user.role).toBe('USER');
            const duplicate = await register(request('/api/auth/register', 'POST', payload)); expect(duplicate.status).toBe(201); expect(await duplicate.json()).toEqual(publicBody);
            if (name === 'admin') await db.client.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
            const logged = await login(request('/api/auth/login', 'POST', payload)); expect(logged.status).toBe(200);
            const cookie = logged.cookies.get('session')!.value;
            expect(logged.headers.get('set-cookie')).toMatch(/HttpOnly/); expect(logged.headers.get('set-cookie')).toMatch(/SameSite=lax/i);
            expect(JSON.stringify(await logged.json())).not.toContain('passwordHash');
            accounts.push({ id: user.id, session: cookie });
        }
    }, 20000);
    it('Profile/Preferences/Resume são próprios inclusive ADMIN; não há leitura ou alteração cross-user', async () => {
        for (let index = 0; index < accounts.length; index++) {
            state.session = accounts[index].session;
            expect(await (await getProfile()).json()).toEqual({ profile: null });
            expect(await (await getPreferences()).json()).toEqual({ preferences: null });
            const profile = { ...profileFixture, headline: 'Synthetic profile ' + index, userId: accounts[1].id };
            const saved = await putProfile(request('/api/profile', 'PUT', profile)); expect(saved.status).toBe(200);
            expect(JSON.stringify(await saved.json())).not.toContain('userId');
            expect((await putPreferences(request('/api/preferences', 'PUT', { ...preferencesFixture, userId: accounts[1].id }))).status).toBe(200);
            const form = new FormData(); form.set('userId', accounts[1].id); form.set('file', new File(['%PDF-1.7\nsynthetic'], 'fixture.pdf', { type: 'application/pdf' }));
            const uploaded = await upload(new Request('https://app.example/api/resumes', { method: 'POST', body: form })); expect(uploaded.status).toBe(201);
            expect(JSON.stringify(await uploaded.json())).not.toMatch(/storageKey|resumes\//);
        }
        expect(await db.client.resume.count()).toBe(3);
        for (let index = 0; index < accounts.length; index++) expect((await db.client.profile.findUniqueOrThrow({ where: { userId: accounts[index].id } })).headline).toBe('Synthetic profile ' + index);
        state.session = accounts[0].session;
        expect((await putProfile(new Request('https://app.example/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json', origin: 'https://attacker.example' }, body: JSON.stringify(profileFixture) }))).status).toBe(403);
        expect((await putPreferences(request('/api/preferences', 'PUT', { ...preferencesFixture, desiredRoles: ['x'.repeat(1000)] }))).status).toBe(400);
    });
    it('cron replay gera matches isolados; feedback cross-user bloqueado; admin só métricas/toggle', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => {});
        expect((await cron(internal('/api/internal/jobs/run'))).status).toBe(200);
        expect((await cron(internal('/api/internal/jobs/run'))).status).toBe(200);
        expect(await db.client.jobMatch.count()).toBe(3);
        const b = await db.client.jobMatch.findFirstOrThrow({ where: { userId: accounts[1].id } });
        for (const account of accounts) {
            state.session = account.session;
            const match = await db.client.jobMatch.findFirstOrThrow({ where: { userId: account.id } });
            const result = await jobs(request('/api/jobs?userId=' + accounts[1].id)); expect(result.status).toBe(200);
            const text = JSON.stringify(await result.json()); expect(text).toContain(match.id); expect(text).not.toContain('userId'); expect(text).not.toContain('<script>');
            const response = await feedback(request('/api/job-matches/' + match.id + '/feedback', 'PUT', { type: 'RELEVANT', userId: accounts[1].id }), { params: Promise.resolve({ id: match.id }) }); expect(response.status).toBe(200);
            if (account.id !== accounts[1].id) expect((await feedback(request('/api/job-matches/' + b.id + '/feedback', 'PUT', { type: 'NOT_RELEVANT' }), { params: Promise.resolve({ id: b.id }) })).status).toBe(404);
            expect((await operations()).status).toBe(account.id === accounts[2].id ? 200 : 403);
        }
        expect(await db.client.matchFeedback.count()).toBe(3);
        expect((await db.client.matchFeedback.findUniqueOrThrow({ where: { jobMatchId: b.id } })).type).toBe('RELEVANT');
        const source = await db.client.jobSource.findFirstOrThrow();
        state.session = accounts[0].session;
        expect((await sourceToggle(request('/api/admin/job-sources/' + source.id, 'PUT', { active: false }), { params: Promise.resolve({ id: source.id }) })).status).toBe(403);
        state.session = accounts[2].session;
        expect((await sourceToggle(request('/api/admin/job-sources/' + source.id, 'PUT', { active: false }), { params: Promise.resolve({ id: source.id }) })).status).toBe(200);
        expect(JSON.stringify(log.mock.calls)).not.toMatch(/@example.com|Synthetic profile|synthetic-cron-test|untrusted fixture/);
        log.mockRestore();
    });
    it('GC mantém referenciados/24h, falha parcial e replay; logout revoga sessão', async () => {
        const old = new Date(Date.now() - 25 * 3600000);
        state.versions.forEach((row) => { row.lastModified = old; });
        state.versions.push({ key: 'resumes/fixture/orphan.pdf', versionId: 'orphan', lastModified: old, isDeleteMarker: false }, { key: 'resumes/fixture/recent.pdf', versionId: 'recent', lastModified: new Date(), isDeleteMarker: true });
        state.failDelete = true;
        expect((await gc(internal('/api/internal/resumes/gc'))).status).toBe(503);
        state.failDelete = false;
        expect((await gc(internal('/api/internal/resumes/gc'))).status).toBe(200);
        expect((await gc(internal('/api/internal/resumes/gc'))).status).toBe(200);
        expect(state.versions).toHaveLength(4);
        expect(state.versions.some((row) => row.versionId === 'orphan')).toBe(false);
        for (const account of accounts) { state.session = account.session; expect((await logout(request('/api/auth/logout', 'POST'))).status).toBe(200); expect((await me()).status).toBe(401); }
        expect(await db.client.session.count()).toBe(0);
    });
});
