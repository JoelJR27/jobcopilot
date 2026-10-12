import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_RESUME_REQUEST_SIZE, readResumeFormData, RESUME_BODY_TIMEOUT_MS } from '@/infrastructure/http/read-resume-form-data';
import { ValidationError } from '@/shared/errors/validation-error';

function streamRequest(stream: ReadableStream<Uint8Array>, headers: HeadersInit = {}) {
    return new Request('http://localhost:3000/api/resumes', {
        method: 'POST', body: stream, duplex: 'half', headers,
    } as RequestInit);
}

describe('Leitura multipart limitada', () => {
    afterEach(() => vi.useRealTimers());

    it('limita bytes reais mesmo sem Content-Length e cancela stream', async () => {
        const cancel = vi.fn();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(new Uint8Array(MAX_RESUME_REQUEST_SIZE + 1)); }, cancel,
        });
        await expect(readResumeFormData(streamRequest(stream))).rejects.toThrow('O formulário de envio do currículo é muito grande.');
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('não confia em Content-Length menor que o corpo', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(new Uint8Array(MAX_RESUME_REQUEST_SIZE + 1)); controller.close(); },
        });
        await expect(readResumeFormData(streamRequest(stream, { 'content-length': '1' }))).rejects.toThrow(ValidationError);
    });

    it('rejeita Content-Length excessivo antes de ler', async () => {
        const request = streamRequest(new ReadableStream<Uint8Array>(), { 'content-length': String(MAX_RESUME_REQUEST_SIZE + 1) });
        const read = vi.spyOn(request.body!, 'getReader');
        await expect(readResumeFormData(request)).rejects.toThrow('O formulário de envio do currículo é muito grande.');
        expect(read).not.toHaveBeenCalled();
        vi.restoreAllMocks();
    });

    it('cancela leitura que ultrapassa 20 segundos', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const request = streamRequest(new ReadableStream<Uint8Array>({ cancel }));
        const result = expect(readResumeFormData(request)).rejects.toThrow('O envio do currículo excedeu o tempo permitido.');
        await vi.advanceTimersByTimeAsync(RESUME_BODY_TIMEOUT_MS);
        await result;
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('falha de stream vira ValidationError sem revelar erro raw', async () => {
        const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('private-fixture-marker')); } });
        await expect(readResumeFormData(streamRequest(stream))).rejects.toThrow('O formulário de envio do currículo é inválido.');
    });

    it('rejeita body ausente', async () => {
        await expect(readResumeFormData(new Request('http://localhost:3000/api/resumes', { method: 'POST' }))).rejects.toThrow(ValidationError);
    });
});
