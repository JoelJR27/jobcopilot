import { afterEach, describe, expect, it, vi } from 'vitest';
import { B2ResumeStorage } from '@/infrastructure/storage/b2/b2-resume-storage';
import { b2Client } from '@/infrastructure/storage/b2/client';
import { executionContext } from '@/application/operations/execution-context';
vi.mock('@/infrastructure/storage/b2/client', () => ({ b2Client: { send: vi.fn() } }));
describe('B2 manutenção limitada', () => {
    afterEach(() => vi.resetAllMocks());
    it('pagina versões com markers sem buscar links e encaminha cancelamento', async () => {
        vi.mocked(b2Client.send).mockResolvedValueOnce({ IsTruncated: true, NextKeyMarker: 'fixture-marker', NextVersionIdMarker: 'fixture-version', Versions: [{ Key: 'resumes/fixture/a.pdf', VersionId: 'v1', LastModified: new Date(0) }] } as never).mockResolvedValueOnce({ IsTruncated: false, DeleteMarkers: [{ Key: 'resumes/fixture/a.pdf', VersionId: 'v2', LastModified: new Date(0) }] } as never);
        const scope = executionContext(1000);
        try {
            const rows = await new B2ResumeStorage().listVersions('resumes/', scope.context); expect(rows).toHaveLength(2); expect(rows[1].isDeleteMarker).toBe(true);
            expect(vi.mocked(b2Client.send).mock.calls[1][0].input).toMatchObject({ KeyMarker: 'fixture-marker', VersionIdMarker: 'fixture-version', MaxKeys: 1000, Prefix: 'resumes/' });
            expect(vi.mocked(b2Client.send).mock.calls[0][1]).toEqual({ abortSignal: scope.context.signal });
        } finally { scope.close(); }
    });
    it('truncamento excessivo ou repetido falha fechado sem lista parcial', async () => {
        vi.mocked(b2Client.send).mockResolvedValue({ IsTruncated: true, NextKeyMarker: 'same', NextVersionIdMarker: 'same' } as never);
        await expect(new B2ResumeStorage().listVersions('resumes/')).rejects.toThrow(); expect(b2Client.send).toHaveBeenCalledTimes(2);
    });
});
