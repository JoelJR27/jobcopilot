import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/resumes/route';
import { UploadResume } from '@/application/resume/upload-resume';
import { MAX_RESUME_SIZE } from '@/application/resume/validate-resume-file';
import type { ResumeRepository } from '@/application/resume/ports/resume-repository';
import type { ResumeStorage } from '@/application/resume/ports/resume-storage';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeUploadResume } from '@/infrastructure/composition/resume';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import type { UserRole } from '@/domain/auth/user-role';
import { makeDocx, makeZip } from '@/tests/fixtures/docx';
import { MAX_RESUME_REQUEST_SIZE } from '@/infrastructure/http/read-resume-form-data';

vi.mock('@/infrastructure/auth/session/require-authenticated-user');
vi.mock('@/infrastructure/composition/resume');

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF = new TextEncoder().encode('%PDF-test');
const DOCX = makeDocx();
const URL = 'http://localhost:3000/api/resumes';

function makeRequest(
    content: Uint8Array = PDF,
    mimeType = PDF_MIME,
    fileName = 'curriculo.pdf',
    headers?: HeadersInit,
) {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(content)], fileName, { type: mimeType }));
    form.set('userId', 'outro-usuario');
    return new Request(URL, { method: 'POST', body: form, headers });
}

describe('POST /api/resumes', () => {
    let repository: ResumeRepository;
    let storage: ResumeStorage;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
        repository = {
            findByUserId: vi.fn(async () => null),
            create: vi.fn(async (data) => ({ ...data, id: 'resume-1', status: 'PENDING' })),
            update: vi.fn(),
        };
        storage = {
            save: vi.fn(async () => { }),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => { }),
        };
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({
            id: `user-${expect.getState().currentTestName}`,
            email: 'user@example.com',
            role: 'USER',
        });
        vi.mocked(makeUploadResume).mockReturnValue(new UploadResume(repository, storage));
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it.each(['USER', 'ADMIN'] as const)('Vercel aceita 4 MiB para %s sem expor storageKey', async (role) => {
        vi.stubEnv('VERCEL', '1');
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({ id: `transport-${role}`, email: 'synthetic@example.test', role });
        const content = new Uint8Array(4 * 1024 * 1024);
        content.set(PDF);
        const response = await POST(makeRequest(content));
        expect(response.status).toBe(201);
        expect(JSON.stringify(await response.json())).not.toContain('storageKey');
    });

    it('Vercel rejeita 4 MiB + 1 byte antes do use case, mantendo domínio em 5 MiB', async () => {
        vi.stubEnv('VERCEL', '1');
        const content = new Uint8Array(4 * 1024 * 1024 + 1);
        content.set(PDF);
        const response = await POST(makeRequest(content));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Nesta implantação, o currículo deve possuir no máximo 4 MB.' });
        expect(makeUploadResume).not.toHaveBeenCalled();
        expect(storage.save).not.toHaveBeenCalled();
        expect(MAX_RESUME_SIZE).toBe(5 * 1024 * 1024);
    });

    it('retorna 401 sem sessão e não lê o corpo', async () => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new UnauthorizedError());
        const request = makeRequest();
        const read = vi.spyOn(request.body!, 'getReader');
        const response = await POST(request);
        expect(response.status).toBe(401);
        expect(read).not.toHaveBeenCalled();
        expect(makeUploadResume).not.toHaveBeenCalled();
    });

    it.each([null, 'curriculo.pdf'])('retorna 400 quando file não é arquivo: %s', async (value) => {
        const form = new FormData();
        if (value !== null) form.set('file', value);
        const response = await POST(new Request(URL, { method: 'POST', body: form }));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'O currículo é obrigatório.' });
        expect(makeUploadResume).not.toHaveBeenCalled();
    });

    it.each([
        ['TXT', PDF, 'text/plain', 'O currículo deve estar no formato PDF ou DOCX.'],
        ['PDF falso', DOCX, PDF_MIME, 'O conteúdo do arquivo PDF é inválido.'],
        ['DOCX falso', PDF, DOCX_MIME, 'O conteúdo do arquivo DOCX é inválido.'],
        ['somente assinatura ZIP', new Uint8Array([0x50, 0x4b, 0x03, 0x04]), DOCX_MIME, 'O conteúdo do arquivo DOCX é inválido.'],
        ['ZIP genérico', makeZip([{ name: 'not-a-docx.txt' }]), DOCX_MIME, 'O conteúdo do arquivo DOCX é inválido.'],
        ['PDF vazio', new Uint8Array(), PDF_MIME, 'O conteúdo do arquivo PDF é inválido.'],
        ['DOCX vazio', new Uint8Array(), DOCX_MIME, 'O conteúdo do arquivo DOCX é inválido.'],
    ])('retorna 400 para %s sem acessar persistência', async (_, content, mime, error) => {
        const response = await POST(makeRequest(content, mime));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error });
        expect(repository.findByUserId).not.toHaveBeenCalled();
        expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejeita mais de 5 MB antes de chamar arrayBuffer', async () => {
        const request = makeRequest(new Uint8Array(MAX_RESUME_SIZE + 1));
        const read = vi.spyOn(File.prototype, 'arrayBuffer');
        const response = await POST(request);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'O currículo deve possuir no máximo 5 MB.' });
        expect(read).not.toHaveBeenCalled();
        expect(makeUploadResume).not.toHaveBeenCalled();
    });

    it.each([
        ['PDF', PDF, PDF_MIME, 'pdf'],
        ['DOCX', DOCX, DOCX_MIME, 'docx'],
    ])('retorna 201 para %s com identidade da sessão e sem storageKey', async (_, content, mime, extension) => {
        const response = await POST(makeRequest(content, mime, 'nome-nao-confiavel.txt', { origin: 'http://localhost:3000' }));
        const user = await vi.mocked(requireAuthenticatedUser).mock.results[0].value;
        expect(response.status).toBe(201);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({
            resume: {
                id: 'resume-1',
                fileName: 'nome-nao-confiavel.txt',
                mimeType: mime,
                fileSize: content.byteLength,
                status: 'PENDING',
            },
        });
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id }));
        expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({
            content,
            contentType: mime,
            key: expect.stringMatching(new RegExp(`\\.${extension}$`)),
        }));
    });

    it.each<[UserRole, string, Uint8Array]>([
        ['USER', PDF_MIME, PDF], ['ADMIN', PDF_MIME, PDF],
        ['USER', DOCX_MIME, DOCX], ['ADMIN', DOCX_MIME, DOCX],
    ])('%s substitui somente o próprio currículo (%s), ignorando userId do cliente', async (role, mime, content) => {
        const owner = `owner-${role}`;
        const ownResume = {
            id: 'own-resume', userId: owner, fileName: 'old.pdf',
            storageKey: `resumes/${owner}/old.pdf`, mimeType: PDF_MIME, fileSize: 10,
        };
        const otherResume = {
            id: 'other-resume', userId: 'outro-usuario', fileName: 'private.pdf',
            storageKey: 'resumes/outro-usuario/private.pdf', mimeType: PDF_MIME, fileSize: 10,
        };
        const records = new Map([[owner, ownResume], ['outro-usuario', otherResume]]);
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({ id: owner, email: 'owner@example.com', role });
        vi.mocked(repository.findByUserId).mockImplementation(async (id) => records.get(id) ?? null);
        vi.mocked(repository.update).mockImplementation(async (id, data) => {
            const current = [...records.values()].find((record) => record.id === id)!;
            const updated = { ...current, ...data, status: 'PENDING' };
            records.set(current.userId, updated);
            return updated;
        });
        const response = await POST(makeRequest(content, mime));
        expect(response.status).toBe(201);
        expect(repository.findByUserId).toHaveBeenCalledExactlyOnceWith(owner);
        expect(records.get('outro-usuario')).toBe(otherResume);
        expect(storage.delete).toHaveBeenCalledExactlyOnceWith(ownResume.storageKey);
        expect(repository.create).not.toHaveBeenCalled();
        expect(await response.json()).toEqual({ resume: {
            id: 'own-resume', fileName: 'curriculo.pdf', mimeType: mime, fileSize: content.byteLength, status: 'PENDING',
        } });
    });

    it('aceita arquivo de exatamente 5 MB', async () => {
        const content = new Uint8Array(MAX_RESUME_SIZE);
        content.set(PDF);
        expect((await POST(makeRequest(content))).status).toBe(201);
    });

    it('retorna 400 para payload multipart total excessivo antes de parsing/persistência', async () => {
        const form = new FormData();
        form.set('file', new File([PDF], 'test.pdf', { type: PDF_MIME }));
        form.set('extra', 'a'.repeat(MAX_RESUME_REQUEST_SIZE));
        // Representar o multipart recebido na rede, evitando o produtor FormData
        // do Undici (Node 24) que lança erro ao ser cancelado entre partes.
        const source = new Request(URL, { method: 'POST', body: form });
        const body = await source.arrayBuffer();
        const response = await POST(new Request(URL, { method: 'POST', body, headers: source.headers }));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'O formulário de envio do currículo é muito grande.' });
        expect(makeUploadResume).not.toHaveBeenCalled();
    });

    it.each([
        { 'content-type': 'application/json' },
        { 'content-type': 'application/x-www-form-urlencoded' },
        { 'content-type': 'multipart/form-data' },
        { 'content-type': 'multipart/form-data; boundary=invalid' },
    ])('retorna 400 para corpo ou content-type inválido: %j', async (headers) => {
        const response = await POST(new Request(URL, { method: 'POST', body: 'invalid', headers }));
        expect(response.status).toBe(400);
        expect(makeUploadResume).not.toHaveBeenCalled();
    });

    it.each<{ headers: HeadersInit }>([
        { headers: { origin: 'https://outro-site.example' } },
        { headers: { origin: 'null' } },
        { headers: { 'sec-fetch-site': 'cross-site' } },
    ])('retorna 403 para requisição de outra origem: %j', async ({ headers }) => {
        const request = makeRequest(PDF, PDF_MIME, 'curriculo.pdf', headers);
        const read = vi.spyOn(request.body!, 'getReader');
        expect((await POST(request)).status).toBe(403);
        expect(read).not.toHaveBeenCalled();
        expect(makeUploadResume).not.toHaveBeenCalled();
    });

    it('limita tentativas por usuário e libera após uma hora', async () => {
        for (let i = 0; i < 10; i += 1) {
            expect((await POST(makeRequest())).status).toBe(201);
        }
        const request = makeRequest();
        const read = vi.spyOn(request.body!, 'getReader');
        const response = await POST(request);
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('3600');
        expect(read).not.toHaveBeenCalled();

        vi.mocked(requireAuthenticatedUser).mockResolvedValueOnce({ id: 'outro-user', email: 'other@example.com', role: 'USER' });
        expect((await POST(makeRequest())).status).toBe(201);

        vi.advanceTimersByTime(60 * 60 * 1000);
        expect((await POST(makeRequest())).status).toBe(201);
    });

    it('retorna 500 controlado sem expor ou registrar conteúdo do erro de infraestrutura', async () => {
        vi.mocked(storage.save).mockRejectedValue(new Error('segredo-storage-interno'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => { });
        const response = await POST(makeRequest());
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Não foi possível enviar o currículo.' });
        expect(log).toHaveBeenCalledExactlyOnceWith('Erro inesperado ao fazer upload do currículo.');
    });

    it('falha de DB e compensação retorna 500 sem expor storageKey ou erros raw', async () => {
        vi.mocked(repository.create).mockRejectedValue(new Error('private-db-fixture'));
        vi.mocked(storage.delete).mockRejectedValue(new Error('private-b2-fixture'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const response = await POST(makeRequest());
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Não foi possível enviar o currículo.' });
        expect(log.mock.calls).toEqual([
            ['Não foi possível remover o novo currículo após falha de persistência.'],
            ['Erro inesperado ao fazer upload do currículo.'],
        ]);
        expect(storage.delete).toHaveBeenCalledOnce();
    });
});
