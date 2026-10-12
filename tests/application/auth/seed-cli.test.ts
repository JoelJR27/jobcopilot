import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);

describe('CLI do seed', () => {
    it('Node 24 carrega a composição e o Prisma Client sem runner adicional', async () => {
        const result = await execute(process.execPath, ['--input-type=module', '-e',
            "import { makeAdminSeed } from './infrastructure/composition/admin-seed.ts'; const seed = makeAdminSeed('postgresql://localhost:5432/unused_seed_test'); await seed.disconnect();",
        ], {
            cwd: fileURLToPath(new URL('../../../', import.meta.url)),
            timeout: 10000,
        });
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('');
    });

    it('falha sem conectar ao DB e sem vazar configuração inválida', async () => {
        const marker = 'sensitive-fixture-marker';
        try {
            await execute(process.execPath, ['prisma/seed.ts'], {
                cwd: fileURLToPath(new URL('../../../', import.meta.url)),
                env: { ...process.env, SEED_ADMIN_EMAIL: marker, SEED_ADMIN_PASSWORD: marker, DATABASE_URL: marker },
                timeout: 10000,
            });
            expect.fail('A CLI deveria terminar com erro.');
        } catch (error) {
            const result = error as { code: number; stdout: string; stderr: string };
            expect(result.code).toBe(1);
            expect(result.stderr).toContain('Não foi possível configurar o administrador.');
            expect(result.stderr).not.toContain(marker);
            expect(result.stdout).not.toContain(marker);
            expect(result.stderr).not.toContain('ZodError');
        }
    });
});
