import { describe, expect, it, vi } from 'vitest';
import { CollectJobs } from '@/application/jobs/collect-jobs';
import { collectedJobFixture } from '@/tests/fixtures/collected-jobs';
import type { JobRepository } from '@/application/jobs/ports/job-repository';

function setup() {
    const collector = { collect: vi.fn(async () => [collectedJobFixture]) };
    const repository = { insertOrIgnore: vi.fn<JobRepository['insertOrIgnore']>(async () => 1) };
    const sourceRepository = { ensure: vi.fn(async () => ({ id: 'source-a', active: true })) };
    return { collector, repository, sourceRepository, source: { name: 'Arbeitnow', baseUrl: 'https://www.arbeitnow.com' } };
}
describe('CollectJobs', () => {
    it('coleta, normaliza, persiste e expõe contadores sem conteúdo', async () => {
        const dependencies = setup();
        const result = await new CollectJobs(dependencies).execute();
        expect(result).toEqual({ collected: 1, inserted: 1, duplicates: 0, skippedInactive: false });
        expect(dependencies.repository.insertOrIgnore).toHaveBeenCalledWith('source-a', [expect.objectContaining({ normalizedUrl: collectedJobFixture.url })]);
    });
    it('contabiliza duplicadas sem exclusão e suporta execução repetida', async () => {
        const dependencies = setup();
        dependencies.repository.insertOrIgnore.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
        const useCase = new CollectJobs(dependencies);
        expect((await useCase.execute()).inserted).toBe(1);
        expect((await useCase.execute()).duplicates).toBe(1);
    });
    it('fonte desativada não é reativada nem buscada', async () => {
        const dependencies = setup();
        dependencies.sourceRepository.ensure.mockResolvedValue({ id: 'source-a', active: false });
        expect((await new CollectJobs(dependencies).execute()).skippedInactive).toBe(true);
        expect(dependencies.collector.collect).not.toHaveBeenCalled();
        expect(dependencies.repository.insertOrIgnore).not.toHaveBeenCalled();
    });
    it('valida lote inteiro antes de escrever e não persiste dados inválidos', async () => {
        const dependencies = setup();
        dependencies.collector.collect.mockResolvedValue([collectedJobFixture, { ...collectedJobFixture, title: '' }]);
        await expect(new CollectJobs(dependencies).execute()).rejects.toThrow('Não foi possível coletar as vagas.');
        expect(dependencies.repository.insertOrIgnore).not.toHaveBeenCalled();
    });
    it('escreve em lotes de no máximo 100', async () => {
        const dependencies = setup();
        dependencies.collector.collect.mockResolvedValue(Array(201).fill(collectedJobFixture));
        await new CollectJobs(dependencies).execute();
        expect(dependencies.repository.insertOrIgnore.mock.calls.map((call) => call[1].length)).toEqual([100, 100, 1]);
    });
    it('resposta vazia nunca exclui vagas existentes', async () => {
        const dependencies = setup();
        dependencies.collector.collect.mockResolvedValue([]);
        expect((await new CollectJobs(dependencies).execute()).collected).toBe(0);
        expect(dependencies.repository.insertOrIgnore).not.toHaveBeenCalled();
    });
});
