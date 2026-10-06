import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/resumes/route';
import { UploadResume } from '@/application/resume/upload-resume';
import { MAX_RESUME_SIZE } from '@/application/resume/validate-resume-file';
import type { ResumeRepository } from '@/application/resume/ports/resume-repository';
import type { ResumeStorage } from '@/application/resume/ports/resume-storage';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeUploadResume } from '@/infrastructure/composition/resume';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';

vi.mock('@/infrastructure/auth/session/require-authenticated-user');
vi.mock('@/infrastructure/composition/resume');

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF = new TextEncoder().encode('%PDF-test');
const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
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
        });
        vi.mocked(makeUploadResume).mockReturnValue(new UploadResume(repository, storage));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('retorna 401 sem sessão e não lê o corpo', async () => {
        vi.mocked(requireAuthenticatedUser).mockRejectedValue(new UnauthorizedError());
        const request = makeRequest();
        const read = vi.spyOn(request, 'formData');
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
        const form = await request.formData();
        const file = form.get('file') as File;
        vi.spyOn(request, 'formData').mockResolvedValue(form);
        const read = vi.spyOn(file, 'arrayBuffer');
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

    it('aceita arquivo de exatamente 5 MB', async () => {
        const content = new Uint8Array(MAX_RESUME_SIZE);
        content.set(PDF);
        expect((await POST(makeRequest(content))).status).toBe(201);
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
        const read = vi.spyOn(request, 'formData');
        expect((await POST(request)).status).toBe(403);
        expect(read).not.toHaveBeenCalled();
        expect(makeUploadResume).not.toHaveBeenCalled();
    });

    it('limita tentativas por usuário e libera após uma hora', async () => {
        for (let i = 0; i < 10; i += 1) {
            expect((await POST(makeRequest())).status).toBe(201);
        }
        const request = makeRequest();
        const read = vi.spyOn(request, 'formData');
        const response = await POST(request);
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('3600');
        expect(read).not.toHaveBeenCalled();

        vi.mocked(requireAuthenticatedUser).mockResolvedValueOnce({ id: 'outro-user', email: 'other@example.com' });
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
});
