import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const MAX_DUMP_BYTES = 64 * 1024 * 1024;
export const MAX_STORAGE_BYTES = 768 * 1024 * 1024;
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const PREFIX = 'database-backups/';
export const MANIFEST_KEY = `${PREFIX}latest.json`;
export const BACKUP_REFRESH_MS = 23 * 60 * 60 * 1000;
const MAGIC = Buffer.from('JCBACK01');

export function checksum(bytes) { return createHash('sha256').update(bytes).digest(); }
export function encryptionKey(value) {
    if (!/^[a-f0-9]{64}$/i.test(value ?? '')) throw new Error('BACKUP_KEY_INVALID');
    return Buffer.from(value, 'hex');
}
export function encryptDump(dump, key) {
    if (!dump.subarray(0, 5).equals(Buffer.from('PGDMP')) || dump.length > MAX_DUMP_BYTES) throw new Error('DUMP_INVALID');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(MAGIC);
    const ciphertext = Buffer.concat([cipher.update(Buffer.concat([checksum(dump), dump])), cipher.final()]);
    return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}
export function decryptDump(encrypted, key) {
    if (encrypted.length < 73 || encrypted.length > MAX_DUMP_BYTES + 68 || !encrypted.subarray(0, 8).equals(MAGIC)) throw new Error('ARCHIVE_INVALID');
    const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(8, 20));
    decipher.setAAD(MAGIC);
    decipher.setAuthTag(encrypted.subarray(20, 36));
    const plaintext = Buffer.concat([decipher.update(encrypted.subarray(36)), decipher.final()]);
    const dump = plaintext.subarray(32);
    if (!timingSafeEqual(checksum(dump), plaintext.subarray(0, 32)) || !dump.subarray(0, 5).equals(Buffer.from('PGDMP'))) throw new Error('CHECKSUM_INVALID');
    return dump;
}
export function backupName(now = new Date()) { return `${PREFIX}${now.toISOString().slice(0, 10)}.pgdump.aes`; }
function manifestBody(value) {
    const { key, versionId, sha256, sizeBytes, snapshotAt } = value;
    if (!/^database-backups\/\d{4}-\d{2}-\d{2}\.pgdump\.aes$/.test(key ?? '') || !/^[a-zA-Z0-9_-]{1,200}$/.test(versionId ?? '') || !/^[a-f0-9]{64}$/.test(sha256 ?? '') || !Number.isInteger(sizeBytes) || sizeBytes < 73 || sizeBytes > MAX_DUMP_BYTES + 68 || typeof snapshotAt !== 'string' || !Number.isFinite(Date.parse(snapshotAt)) || new Date(snapshotAt).toISOString() !== snapshotAt) throw new Error('MANIFEST_INVALID');
    return { key, versionId, sha256, sizeBytes, snapshotAt };
}
function manifestSignature(body, key) {
    const signingKey = createHmac('sha256', key).update('jobcopilot-backup-manifest-v1').digest();
    return createHmac('sha256', signingKey).update(JSON.stringify(body)).digest('hex');
}
export function signManifest(value, key) {
    const body = manifestBody(value);
    return { ...body, signature: manifestSignature(body, key) };
}
export function verifyManifest(value, key) {
    const body = manifestBody(value);
    if (!/^[a-f0-9]{64}$/.test(value.signature ?? '') || !timingSafeEqual(Buffer.from(value.signature, 'hex'), Buffer.from(manifestSignature(body, key), 'hex'))) throw new Error('MANIFEST_INVALID');
    return body;
}
export function backupDue(snapshotAt, now = new Date()) {
    const timestamp = Date.parse(snapshotAt);
    if (!Number.isFinite(timestamp) || timestamp > now.getTime() + 300000) throw new Error('MANIFEST_TIME_INVALID');
    return now.getTime() - timestamp >= BACKUP_REFRESH_MS;
}
export function expiredVersion(version, now = new Date()) {
    // Unknown names/timestamps never authorize a deletion. Both dates must be old.
    const match = /^database-backups\/(\d{4}-\d{2}-\d{2})\.pgdump\.aes$/.exec(version.Key ?? '');
    if (!match || !version.VersionId || !(version.LastModified instanceof Date)) return false;
    const day = Date.parse(`${match[1]}T00:00:00.000Z`);
    return Number.isFinite(day) && now.getTime() - day > RETENTION_MS && now.getTime() - version.LastModified.getTime() > RETENTION_MS;
}
export function postgresEnvironment(value) {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') || url.hostname.includes('-pooler.')) throw new Error('DIRECT_DATABASE_INVALID');
    return { PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'verify-full', PGSSLROOTCERT: '/etc/ssl/certs/ca-certificates.crt', PGCONNECT_TIMEOUT: '10' };
}
