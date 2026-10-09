import { describe, expect, it } from 'vitest';
// Operational script, intentionally outside the application/domain.
import { encryptDump, decryptDump, encryptionKey, expiredVersion, backupName, postgresEnvironment, MAX_DUMP_BYTES } from '../../scripts/database-backup-lib.mjs';

describe('backup operacional', () => {
    const key = encryptionKey('ab'.repeat(32));
    it('criptografa com autenticação e recupera custom format íntegro', () => {
        const dump = Buffer.from('PGDMPsynthetic');
        const encrypted = encryptDump(dump, key);
        expect(encrypted.includes(dump)).toBe(false);
        expect(decryptDump(encrypted, key)).toEqual(dump);
        expect(encryptDump(dump, key)).not.toEqual(encrypted);
    });
    it('rejeita adulteração e key incorreta', () => {
        const encrypted = encryptDump(Buffer.from('PGDMPsynthetic'), key);
        encrypted[encrypted.length - 1] ^= 1;
        expect(() => decryptDump(encrypted, key)).toThrow();
        expect(() => decryptDump(encryptDump(Buffer.from('PGDMPx'), key), encryptionKey('cd'.repeat(32)))).toThrow();
    });
    it('rejeita dump inválido, excesso e key malformada', () => {
        expect(() => encryptDump(Buffer.from('not archive'), key)).toThrow();
        expect(() => encryptDump(Buffer.alloc(MAX_DUMP_BYTES + 1), key)).toThrow();
        expect(() => encryptionKey('secret')).toThrow();
    });
    it('mantém sete dias completos e ignora nomes externos/desconhecidos', () => {
        const now = new Date('2026-10-08T12:00:00Z');
        const version = { Key: 'database-backups/2026-10-01.pgdump.aes', VersionId: 'synthetic', LastModified: new Date('2026-10-01T12:00:00Z') };
        expect(expiredVersion(version, now)).toBe(false);
        expect(expiredVersion(version, new Date(now.getTime() + 1))).toBe(true);
        expect(expiredVersion({ ...version, Key: 'resumes/private.pdf' }, now)).toBe(false);
        expect(expiredVersion({ ...version, LastModified: new Date() }, now)).toBe(false);
        expect(backupName(now)).toBe('database-backups/2026-10-08.pgdump.aes');
    });
    it('usa conexão direta Neon e verify-full; segredo somente em env', () => {
        expect(postgresEnvironment('postgresql://synthetic:synthetic@ep-test.eu.neon.tech/neondb').PGSSLMODE).toBe('verify-full');
        expect(() => postgresEnvironment('postgresql://test:test@ep-test-pooler.eu.neon.tech/neondb')).toThrow();
        expect(() => postgresEnvironment('postgresql://test:test@localhost/db')).toThrow();
    });
});
