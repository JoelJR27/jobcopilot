import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { S3Client, ListObjectVersionsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { databaseOptions } from '../shared/config/database-env.ts';
import { makeDocx } from '../tests/fixtures/docx.ts';

const origin = 'https://jobcopilot-zeta.vercel.app';
const prefix = `release-smoke-${randomUUID().slice(0, 8)}`;
const accounts = ['a', 'b', 'admin'].map(tag => ({ tag, email: `${prefix}-${tag}@example.test`, password: `Aa1!${randomBytes(24).toString('hex')}`, cookie: '', id: undefined }));
let stage = 'unauthenticated'; let checks = 0; let db; let storage;
const assert = (code, valid) => { if (!valid) { const error = new Error(code); error.name = 'SmokeAssertion'; throw error; } checks++; };
const log = (event, fields = {}) => console.info(JSON.stringify({ event, ...fields }));
function minimal(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        assert('RESPONSE_INTERNAL_FIELD', !['storageKey', 'passwordHash', 'sessionId', 'token', 'cookie', 'stack'].includes(key));
        assert('RESPONSE_PASSWORD', key !== 'password' || (Array.isArray(child) && child.every(v => typeof v === 'string')));
        minimal(child);
    }
}
async function request(path, account, method = 'GET', payload, extra = {}) {
    const headers = { ...(account?.cookie ? { Cookie: account.cookie } : {}), ...(method !== 'GET' ? { Origin: origin } : {}), ...extra };
    let body = payload;
    if (payload && !(payload instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(payload); }
    const response = await fetch(origin + path, { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(path.includes('/internal/') ? 290000 : 30000) });
    const text = await response.text(); let json;
    try { json = JSON.parse(text); } catch { json = {}; }
    minimal(json);
    if (path.startsWith('/api/')) assert('NO_STORE', response.headers.get('cache-control') === 'no-store');
    return { response, json, text };
}
async function login(account) {
    const r = await request('/api/auth/login', undefined, 'POST', { email: account.email, password: account.password });
    assert('LOGIN', r.response.status === 200 && r.json.user?.email === account.email);
    assert('ROLE', r.json.user.role === (account.promoted ? 'ADMIN' : 'USER'));
    const cookies = r.response.headers.getSetCookie();
    assert('COOKIE_FLAGS', cookies.some(c => /HttpOnly/i.test(c) && /Secure/i.test(c) && /SameSite=lax/i.test(c) && /Path=\//i.test(c)));
    account.cookie = cookies.map(c => c.split(';')[0]).join('; '); account.id = r.json.user.id;
    assert('IDENTITY', /^[0-9a-f-]{36}$/i.test(account.id));
}
async function upload(account, docx = false) {
    const form = new FormData();
    const bytes = docx ? makeDocx() : Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    form.set('file', new File([bytes], `synthetic.${docx ? 'docx' : 'pdf'}`, { type: docx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf' }));
    const r = await request('/api/resumes', account, 'POST', form); assert(docx ? 'DOCX_UPLOAD' : 'PDF_UPLOAD', r.response.status === 201);
}
function makeStorage() { return new S3Client({ endpoint: process.env.B2_ENDPOINT, region: process.env.B2_REGION, credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APPLICATION_KEY }, maxAttempts: 1, requestHandler: { requestTimeout: 15000 } }); }

try {
    assert('TLS_NOT_DISABLED', process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0');
    let r = await request('/api/health'); assert('HTTPS_HEALTH', r.response.status === 200);
    for (const path of ['/api/auth/me', '/api/profile', '/api/preferences', '/api/jobs', '/api/admin/operations', '/api/internal/jobs/run', '/api/internal/resumes/gc']) {
        r = await request(path); assert('UNAUTHENTICATED_401', r.response.status === 401);
    }
    stage = 'register_login';
    for (const account of accounts) {
        r = await request('/api/auth/register', undefined, 'POST', { email: account.email, password: account.password, role: 'ADMIN' });
        assert('REGISTER', r.response.status === 201); await login(account);
    }
    const owner = new URL(process.env.DATABASE_URL_PRODUCTION); owner.hostname = owner.hostname.replace(/-pooler(?=\.)/, ''); owner.searchParams.set('sslmode', 'verify-full');
    db = new pg.Client(databaseOptions(owner.href)); await db.connect();
    const admin = accounts[2];
    const seed = spawnSync('pnpm.cmd', ['db:seed'], { shell: true, env: { ...process.env, DATABASE_URL: owner.href, DIRECT_DATABASE_URL: owner.href, SEED_ADMIN_EMAIL: admin.email, SEED_ADMIN_PASSWORD: admin.password }, encoding: 'utf8', timeout: 60000 });
    assert('SYNTHETIC_ADMIN_SEED', seed.status === 0); admin.promoted = true; await login(admin);
    stage = 'professional_data';
    for (const account of accounts) {
        r = await request('/api/auth/me', account); assert('AUTH_ME', r.json.user?.id === account.id);
        r = await request('/api/profile', account); assert('EMPTY_PROFILE', r.response.status === 200 && r.json.profile === null);
        r = await request('/api/preferences', account); assert('EMPTY_PREFERENCES', r.response.status === 200 && r.json.preferences === null);
        const role = account.tag === 'a' ? 'Software Engineer' : `Synthetic ${account.tag} role`;
        account.profile = { headline: `Synthetic ${account.tag}`, summary: 'Synthetic smoke only', skills: ['TypeScript', 'JavaScript'], experiences: ['Synthetic experience'], education: ['Synthetic education'], languages: ['Português'], roles: [role], seniority: 'MID' };
        account.preferences = { desiredRoles: [role], desiredSkills: ['TypeScript'], seniority: 'MID', workModels: ['REMOTE'], locations: ['Brasil'] };
        r = await request('/api/profile', account, 'PUT', { ...account.profile, userId: accounts[1].id }); assert('PROFILE_UPSERT', r.response.status === 200 && r.json.profile?.headline === account.profile.headline);
        r = await request('/api/preferences', account, 'PUT', { ...account.preferences, userId: accounts[1].id }); assert('PREFERENCES_UPSERT', r.response.status === 200);
        await upload(account, account.tag === 'b');
    }
    const [a, b] = accounts; await upload(a, true);
    stage = 'resume_http_boundary';
    for (const size of [4 * 1024 * 1024, 4 * 1024 * 1024 + 1]) {
        const bytes = Buffer.alloc(size, 32); bytes.write('%PDF-1.4\n');
        const form = new FormData(); form.set('file', new File([bytes], 'synthetic-boundary.pdf', { type: 'application/pdf' }));
        r = await request('/api/resumes', a, 'POST', form);
        assert(size === 4 * 1024 * 1024 ? 'VERCEL_HTTP_4_MIB_ACCEPTED' : 'VERCEL_HTTP_OVER_4_MIB_REJECTED', r.response.status === (size === 4 * 1024 * 1024 ? 201 : 400));
    }
    log('production_resume_http_cap', { limitBytes: 4 * 1024 * 1024, acceptedAtLimit: true, rejectedAboveLimit: true, domainLimitBytes: 5 * 1024 * 1024 });
    r = await request(`/api/profile?userId=${b.id}`, a); assert('CROSS_USER_PROFILE_READ', r.json.profile.headline === a.profile.headline);
    r = await request(`/api/preferences?userId=${b.id}`, a); assert('CROSS_USER_PREFERENCES_READ', r.json.preferences.desiredRoles[0] === a.preferences.desiredRoles[0]);
    r = await request('/api/profile', b); assert('CROSS_USER_PROFILE_WRITE', r.json.profile.headline === b.profile.headline);
    r = await request('/api/preferences', b); assert('CROSS_USER_PREFERENCES_WRITE', r.json.preferences.desiredRoles[0] === b.preferences.desiredRoles[0]);
    r = await request('/api/profile', a, 'PUT', { headline: [] }); assert('INVALID_PAYLOAD', r.response.status === 400 && !/PrismaClient|passwordHash|stack trace/i.test(r.text));
    r = await request('/api/profile', a, 'PUT', a.profile, { Origin: 'https://cross-site.invalid', 'Sec-Fetch-Site': 'cross-site' }); assert('CROSS_ORIGIN', r.response.status === 403);
    r = await request('/api/admin/operations', a); assert('USER_ADMIN_403', r.response.status === 403);
    r = await request('/onboarding', a); assert('ONBOARDING', r.response.status === 200 && !/PrismaClient|storageKey|passwordHash/i.test(r.text));
    stage = 'pipeline';
    const auth = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
    r = await request('/api/internal/jobs/run', undefined, 'GET', undefined, auth); assert('PIPELINE_SUCCESS', r.response.status === 200);
    const before = (await db.query('SELECT count(*)::int AS count FROM public."Job"')).rows[0].count;
    r = await request('/api/internal/jobs/run', undefined, 'GET', undefined, auth); assert('PIPELINE_REPLAY_SUCCESS', r.response.status === 200);
    assert('JOB_REPLAY_IDEMPOTENT', before === (await db.query('SELECT count(*)::int AS count FROM public."Job"')).rows[0].count);
    const sources = (await db.query('SELECT s.name, count(j.id)::int AS jobs FROM public."JobSource" s LEFT JOIN public."Job" j ON j."sourceId"=s.id GROUP BY s.name ORDER BY s.name')).rows;
    assert('THREE_SOURCES', sources.length === 3 && sources.every(s => s.jobs > 0 && ['CI&T / Lever', 'Swile / Lever', 'Arbeitnow'].includes(s.name)));
    log('production_sources', { sources });
    stage = 'jobs_feedback_admin';
    for (const account of accounts) { r = await request('/api/jobs', account); assert('OWN_MATCHES', r.response.status === 200 && !r.json.incomplete && r.json.jobs.length > 0); account.matches = r.json.jobs; assert('MATCH_DTO', account.matches.every(m => m.score >= 0 && m.score <= 100 && !('userId' in m) && !('jobId' in m))); }
    assert('USER_MATCH_ISOLATION', a.matches.every(m => !b.matches.some(x => x.id === m.id)));
    r = await request(`/api/jobs?userId=${b.id}`, a); assert('CROSS_USER_JOBS', r.json.jobs[0].id === a.matches[0].id);
    for (const account of [a, admin]) { r = await request(`/api/job-matches/${b.matches[0].id}/feedback`, account, 'PUT', { type: 'RELEVANT', userId: b.id }); assert('CROSS_USER_FEEDBACK', r.response.status === 404); }
    const feedbackPath = `/api/job-matches/${a.matches[0].id}/feedback`;
    for (let i = 0; i < 2; i++) { r = await request(feedbackPath, a, 'PUT', { type: 'RELEVANT', userId: b.id }); assert('FEEDBACK_UPSERT', r.response.status === 200); }
    const feedbacks = (await db.query('SELECT count(*)::int AS count FROM public."MatchFeedback" WHERE "jobMatchId"=$1 AND "userId"=$2', [a.matches[0].id, a.id])).rows[0].count; assert('FEEDBACK_NO_DUPLICATE', feedbacks === 1);
    r = await request('/api/admin/operations', admin); assert('ADMIN_METRICS', r.response.status === 200 && r.json.sources.length === 3);
    const source = r.json.sources.find(s => s.name === 'Arbeitnow');
    for (const active of [false, true]) { r = await request(`/api/admin/job-sources/${source.id}`, admin, 'PUT', { active }); assert('ADMIN_SOURCE_TOGGLE', r.response.status === 200); }
    r = await request(`/api/admin/job-sources/${source.id}`, a, 'PUT', { active: false }); assert('USER_SOURCE_403', r.response.status === 403);
    stage = 'distributed_limit';
    const firstCookie = a.cookie; await login(a); const secondCookie = a.cookie; let limited = 0;
    for (let i = 0; i < 66; i++) { a.cookie = i % 2 ? firstCookie : secondCookie; r = await request(feedbackPath, a, 'PUT', { type: 'RELEVANT' }); assert('FEEDBACK_LIMIT_STATUS', [200, 429].includes(r.response.status)); if (r.response.status === 429) { limited++; assert('RETRY_AFTER', Number(r.response.headers.get('retry-after')) > 0); } }
    assert('RATE_429', limited > 0);
    for (const cookie of [firstCookie, secondCookie]) { a.cookie = cookie; r = await request(feedbackPath, a, 'PUT', { type: 'RELEVANT' }); assert('TWO_SESSIONS_SHARED_429', r.response.status === 429 && Number(r.response.headers.get('retry-after')) > 0); }
    assert('POSTGRES_BUCKETS', (await db.query('SELECT count(*)::int AS count FROM public."RateLimitBucket"')).rows[0].count > 0);
    log('distributed_rate_verified', { limited, twoSessions: true, postgresBucketsPresent: true });
    stage = 'gc_inventory'; storage = makeStorage();
    const inventory = await storage.send(new ListObjectVersionsCommand({ Bucket: process.env.B2_BUCKET_NAME, Prefix: 'resumes/', MaxKeys: 1000 })); assert('GC_LIST_COMPLETE', !inventory.IsTruncated);
    const references = new Set((await db.query('SELECT "storageKey" FROM public."Resume"')).rows.map(row => row.storageKey));
    const versions = [...(inventory.Versions ?? []), ...(inventory.DeleteMarkers ?? [])];
    assert('GC_REFERENCES_IN_CORRECT_BUCKET', [...references].every(key => inventory.Versions?.some(v => v.Key === key && v.IsLatest)));
    const aged = versions.filter(v => v.LastModified && v.LastModified.getTime() < Date.now() - 86400000 && !references.has(v.Key)); assert('NO_UNEXPECTED_GC_CANDIDATE', aged.length === 0);
    log('production_gc_inventory', { versions: versions.length, referenced: references.size, olderThan24hCandidates: aged.length });
    r = await request('/api/internal/resumes/gc', undefined, 'GET', undefined, auth); assert('GC_SUCCESS', r.response.status === 200);
    stage = 'logout';
    for (const account of accounts) { r = await request('/api/auth/logout', account, 'POST'); assert('LOGOUT', r.response.status === 200); r = await request('/api/auth/me', account); assert('LOGOUT_REVOKED', r.response.status === 401); }
    log('production_https_smoke', { passed: true, checks, url: origin });
} catch (error) {
    log('production_https_smoke', { passed: false, stage, checks, failure: error.name === 'SmokeAssertion' ? error.message : 'CONTROLLED_SMOKE_FAILURE' }); process.exitCode = 1;
} finally {
    if (db) {
        try {
            storage ??= makeStorage();
            for (const account of accounts.filter(a => a.id)) {
                const found = await db.query('SELECT id FROM public."User" WHERE id=$1 AND email=$2', [account.id, account.email]); if (found.rows.length !== 1) continue;
                const scope = `resumes/${account.id}/`;
                const v = await storage.send(new ListObjectVersionsCommand({ Bucket: process.env.B2_BUCKET_NAME, Prefix: scope, MaxKeys: 1000 })); if (v.IsTruncated) throw new Error('CLEANUP_LIMIT');
                for (const object of [...(v.Versions ?? []), ...(v.DeleteMarkers ?? [])]) {
                    if (!object.Key?.startsWith(scope) || !object.VersionId) throw new Error('CLEANUP_SCOPE');
                    await storage.send(new DeleteObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: object.Key, VersionId: object.VersionId }));
                }
                await db.query('DELETE FROM public."User" WHERE id=$1 AND email=$2', [account.id, account.email]);
            }
            log('synthetic_smoke_cleanup', { completed: true, realAccountsTouched: false });
        } catch { log('synthetic_smoke_cleanup', { completed: false, realAccountsTouched: false }); process.exitCode = 1; }
        finally { await db.end(); }
    }
    storage?.destroy();
}
