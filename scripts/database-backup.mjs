import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectVersionsCommand, DeleteObjectCommand, GetBucketAclCommand } from '@aws-sdk/client-s3';
import { MAX_DUMP_BYTES, MAX_STORAGE_BYTES, PREFIX, checksum, encryptionKey, encryptDump, decryptDump, backupName, expiredVersion, postgresEnvironment } from './database-backup-lib.mjs';

const IMAGE = 'postgres:18@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336';
const started = Date.now();
const deadline = AbortSignal.timeout(12 * 60 * 1000);
const log = (event, fields = {}) => console.info(JSON.stringify({ event, ...fields }));
let stage = 'configuration';
let lock;
let s3;
let acquired = false;
let restoredBranch;

async function postgresTool(tool, database, input) {
    const environment = postgresEnvironment(database);
    const name = `jobcopilot-backup-${randomUUID()}`;
    const args = ['run', '--rm', '--name', name, '-i', '--mount', 'type=bind,source=/etc/ssl/certs/ca-certificates.crt,target=/etc/ssl/certs/ca-certificates.crt,readonly', ...Object.keys(environment).flatMap(k => ['-e', k]), IMAGE, tool,
        ...(tool === 'pg_dump' ? ['--format=custom', '--no-owner', '--no-privileges'] : ['--dbname', environment.PGDATABASE, '--exit-on-error', '--no-owner', '--no-privileges'])];
    try {
        return await new Promise((resolve, reject) => {
            const child = spawn('docker', args, { env: { ...process.env, ...environment }, shell: false, windowsHide: true, signal: deadline, timeout: 180000 });
            const chunks = []; let size = 0; let exceeded = false; let diagnostic = '';
            child.stdout.on('data', chunk => { size += chunk.length; if (size > MAX_DUMP_BYTES) { exceeded = true; child.kill(); } else chunks.push(chunk); });
            child.stderr.on('data', chunk => { if (diagnostic.length < 16384) diagnostic += chunk.toString(); });
            child.on('error', () => reject(new Error('POSTGRES_TOOL_FAILED')));
            child.on('close', code => {
                if (code === 0 && !exceeded) return resolve(Buffer.concat(chunks));
                const categories = [[/root certificate file.*does not exist/i, 'TLS_CA_MISSING'], [/certificate verify failed/i, 'TLS_CA_REJECTED'], [/does not match host/i, 'TLS_HOSTNAME'], [/certificate|root\.crt|SSL error/i, 'TLS'], [/authentication failed|password/i, 'AUTH'], [/version mismatch|server version/i, 'VERSION'], [/rate limit|toomanyrequests/i, 'IMAGE_QUOTA'], [/could not translate|connection refused|timeout/i, 'CONNECTION'], [/manifest unknown|not found/i, 'IMAGE_OR_EXECUTABLE']];
                const category = exceeded ? 'SIZE_LIMIT' : categories.find(([pattern]) => pattern.test(diagnostic))?.[1] ?? 'TOOL_FAILURE';
                log('database_backup_tool_failed', { tool, category, exitCode: code });
                reject(new Error('POSTGRES_TOOL_FAILED'));
            });
            child.stdin.on('error', () => {});
            child.stdin.end(input);
        });
    } finally {
        // Only this invocation's random named container; no filesystem deletion.
        await new Promise(resolve => { const cleanup = spawn('docker', ['rm', '-f', name], { stdio: 'ignore', timeout: 10000, windowsHide: true }); cleanup.on('error', resolve); cleanup.on('close', resolve); });
    }
}
function databaseOptions(value) {
    postgresEnvironment(value);
    const url = new URL(value);
    for (const field of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(field);
    return { connectionString: url.href, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000, statement_timeout: 10000 };
}
async function neon(path, body, method = body ? 'POST' : 'GET') {
    deadline.throwIfAborted();
    const response = await fetch(`https://console.neon.tech/api/v2${path}`, { method, headers: { Authorization: `Bearer ${process.env.NEON_API_KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.any([deadline, AbortSignal.timeout(20000)]) });
    if (!response.ok) throw new Error('NEON_OPERATION_FAILED');
    if (response.status === 204) return {};
    return response.json();
}
async function signature(value) {
    const client = new pg.Client(databaseOptions(value));
    client.on('error', () => {});
    try {
        await client.connect();
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const { rows } = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
        const counts = [];
        for (const { table_name: name } of rows) {
            const quoted = name.replaceAll('"', '""');
            const result = await client.query(`SELECT count(*)::text AS count FROM public."${quoted}"`);
            counts.push([name, result.rows[0].count]);
        }
        let migrations = [];
        if (rows.some(r => r.table_name === '_prisma_migrations')) migrations = (await client.query('SELECT migration_name, finished_at IS NOT NULL AS finished FROM public._prisma_migrations ORDER BY migration_name')).rows;
        await client.query('COMMIT');
        const columns = (await client.query("SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position")).rows;
        const indexes = (await client.query("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname")).rows;
        return { counts, migrations, columns, indexes };
    } finally { await client.end(); }
}
async function verifyRestore(dump) {
    stage = 'restore_branch_creation';
    const project = '/projects/divine-glade-30234028';
    const source = new URL(process.env.DIRECT_DATABASE_URL);
    const endpoints = await neon(`${project}/endpoints`);
    const parent = endpoints.endpoints.find(e => e.id === source.hostname.split('.')[0]);
    if (!parent || parent.branch_id !== 'br-weathered-cloud-b60xgn2w') throw new Error('PRODUCTION_IDENTITY_MISMATCH');
    const branches = await neon(`${project}/branches`);
    if (branches.branches.length >= 10) throw new Error('BRANCH_QUOTA');
    const baseline = await signature(source.href);
    const branch = await neon(`${project}/branches`, { branch: { name: `backup-restore-test-${randomUUID().slice(0, 8)}`, parent_id: parent.branch_id, init_source: 'schema-only' }, endpoints: [{ type: 'read_write' }] });
    restoredBranch = branch.branch.id;
    // Neon schema-only copies are independent roots (init_source=parent-schema).
    if (restoredBranch === parent.branch_id || branch.branch.init_source !== 'parent-schema') throw new Error('RESTORE_ISOLATION_FAILED');
    const uri = await neon(`${project}/connection_uri?branch_id=${encodeURIComponent(restoredBranch)}&database_name=${encodeURIComponent(decodeURIComponent(source.pathname.slice(1)))}&role_name=${encodeURIComponent(decodeURIComponent(source.username))}`);
    const target = new URL(uri.uri);
    if (target.hostname === source.hostname || target.hostname.replace(/-pooler(?=\.)/, '') === source.hostname || !target.hostname.endsWith('.neon.tech')) throw new Error('RESTORE_ISOLATION_FAILED');
    target.hostname = target.hostname.replace(/-pooler(?=\.)/, '');
    // Schema-only clone is not empty: remove only its cloned public schema before restore.
    const isolated = new pg.Client(databaseOptions(target.href)); isolated.on('error', () => {});
    try { await isolated.connect(); await isolated.query('DROP SCHEMA public CASCADE'); } finally { await isolated.end(); }
    stage = 'pg_restore';
    await postgresTool('pg_restore', target.href, dump);
    const restoredClient = new pg.Client(databaseOptions(target.href)); restoredClient.on('error', () => {});
    try { await restoredClient.connect(); await restoredClient.query('CREATE SCHEMA IF NOT EXISTS public'); } finally { await restoredClient.end(); }
    stage = 'restore_validation';
    const restored = await signature(target.href);
    if (JSON.stringify(baseline) !== JSON.stringify(restored)) throw new Error('RESTORE_COUNTS_MISMATCH');
    log('database_restore_verified', { tables: restored.counts.length, migrations: restored.migrations.length, isolated: true });
    // Delete only the explicitly recorded disposable branch after successful validation.
    await neon(`${project}/branches/${encodeURIComponent(restoredBranch)}`, undefined, 'DELETE');
    restoredBranch = undefined;
}

try {
    const key = encryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
    const url = process.env.DIRECT_DATABASE_URL;
    postgresEnvironment(url);
    const endpoint = new URL(process.env.BACKUP_B2_ENDPOINT);
    if (endpoint.protocol !== 'https:' || !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/.test(endpoint.hostname) || endpoint.username || endpoint.password) throw new Error('STORAGE_ENDPOINT_INVALID');
    if (!process.env.BACKUP_B2_BUCKET?.startsWith('jobcopilot-db-backups-')) throw new Error('BUCKET_INVALID');
    if (!process.env.BACKUP_B2_KEY_ID || !process.env.BACKUP_B2_APPLICATION_KEY) throw new Error('STORAGE_CREDENTIALS_MISSING');
    lock = new pg.Client(databaseOptions(url)); lock.on('error', () => { process.exitCode = 1; });
    await lock.connect();
    acquired = (await lock.query('SELECT pg_try_advisory_lock(742911, 4) AS acquired')).rows[0].acquired;
    if (!acquired) throw new Error('BACKUP_BUSY');
    log('database_backup_started');
    s3 = new S3Client({ endpoint: endpoint.href, region: process.env.BACKUP_B2_REGION, credentials: { accessKeyId: process.env.BACKUP_B2_KEY_ID, secretAccessKey: process.env.BACKUP_B2_APPLICATION_KEY }, maxAttempts: 2, requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 } });
    const bucket = process.env.BACKUP_B2_BUCKET;
    const send = command => { deadline.throwIfAborted(); return s3.send(command, { abortSignal: deadline }); };
    stage = 'private_storage';
    const acl = await send(new GetBucketAclCommand({ Bucket: bucket }));
    if (acl.Grants?.some(g => g.Grantee?.Type === 'Group')) throw new Error('BUCKET_NOT_PRIVATE');
    stage = 'inventory';
    const inventory = await send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: PREFIX, MaxKeys: 1000 }));
    if (inventory.IsTruncated) throw new Error('INVENTORY_LIMIT');
    const versions = [...(inventory.Versions ?? []), ...(inventory.DeleteMarkers ?? [])];
    const storageBytes = (inventory.Versions ?? []).reduce((sum, v) => sum + (v.Size ?? MAX_STORAGE_BYTES), 0);
    const name = backupName();
    let encrypted;
    let replay = false;
    try {
        const existing = await send(new GetObjectCommand({ Bucket: bucket, Key: name }));
        if (!existing.ContentLength || existing.ContentLength > MAX_DUMP_BYTES + 68) throw new Error('ARCHIVE_LIMIT');
        encrypted = Buffer.from(await existing.Body.transformToByteArray());
        if (existing.Metadata?.sha256 !== checksum(encrypted).toString('hex')) throw new Error('CHECKSUM_INVALID');
        decryptDump(encrypted, key); replay = true;
    } catch (error) { if (error?.name !== 'NoSuchKey') throw error; }
    if (!replay) {
        stage = 'pg_dump';
        const dump = await postgresTool('pg_dump', url);
        stage = 'encrypt';
        encrypted = encryptDump(dump, key);
        if (storageBytes + encrypted.length > MAX_STORAGE_BYTES) throw new Error('FREE_STORAGE_BUDGET');
        stage = 'upload';
        await send(new PutObjectCommand({ Bucket: bucket, Key: name, Body: encrypted, ContentType: 'application/octet-stream', Metadata: { sha256: checksum(encrypted).toString('hex') } }));
    }
    stage = 'retrieve_checksum_decrypt';
    const retrieved = await send(new GetObjectCommand({ Bucket: bucket, Key: name }));
    if (retrieved.ContentLength !== encrypted.length) throw new Error('ARCHIVE_SIZE_MISMATCH');
    const bytes = Buffer.from(await retrieved.Body.transformToByteArray());
    if (!checksum(bytes).equals(checksum(encrypted)) || retrieved.Metadata?.sha256 !== checksum(bytes).toString('hex')) throw new Error('CHECKSUM_INVALID');
    const dump = decryptDump(bytes, key);
    if (process.env.BACKUP_VERIFY_RESTORE === 'true') await verifyRestore(dump);
    stage = 'rotation';
    let removed = 0;
    for (const version of versions) if (expiredVersion(version)) { await send(new DeleteObjectCommand({ Bucket: bucket, Key: version.Key, VersionId: version.VersionId })); removed++; }
    log('database_backup_completed', { durationMs: Date.now() - started, sizeBytes: encrypted.length, checksumPrefix: checksum(encrypted).toString('hex').slice(0, 12), replay, removed });
} catch {
    log('database_backup_failed', { stage, durationMs: Date.now() - started, isolatedBranchRetained: !!restoredBranch });
    process.exitCode = 1;
} finally {
    if (lock) { if (acquired) await lock.query('SELECT pg_advisory_unlock(742911, 4)').catch(() => {}); await lock.end().catch(() => {}); }
    s3?.destroy();
}
