import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
describe('CLI de coleta', () => {
    it('Node 24 carrega composição sem runner/dependências novas', async () => {
        const result = await execute(process.execPath, ['--input-type=module', '-e',
            "import { makeJobCollection } from './infrastructure/composition/job-collection.ts'; const collection=makeJobCollection('postgresql://localhost:5432/unused_test'); await collection.disconnect();",
        ], { cwd: fileURLToPath(new URL('../../../', import.meta.url)), timeout: 10000 });
        expect(result.stdout).toBe(''); expect(result.stderr).toBe('');
    });
    it('erro de configuração não vaza env/credencial e termina com erro', async () => {
        const marker = 'private-configuration-fixture';
        try {
            await execute(process.execPath, ['scripts/collect-jobs.ts'], { cwd: fileURLToPath(new URL('../../../', import.meta.url)), env: { ...process.env, DATABASE_URL: marker }, timeout: 10000 });
            expect.fail('A CLI deveria rejeitar configuração inválida.');
        } catch (error) {
            const result = error as { code: number; stdout: string; stderr: string };
            expect(result.code).toBe(1);
            expect(result.stderr).toContain('Não foi possível coletar as vagas.');
            expect(result.stderr + result.stdout).not.toContain(marker);
        }
    });
});
