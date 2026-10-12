import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_BODY_TIMEOUT_MS, MAX_ACCOUNT_BODY_SIZE, readAccountJson } from '@/infrastructure/http/account-data';

describe('Leitura JSON limitada para dados profissionais', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

    it('rejeita Content-Length alto antes de adquirir reader', async () => {
        const request = new Request('http://localhost/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json', 'content-length': String(MAX_ACCOUNT_BODY_SIZE + 1) }, body: '{}' });
        const read = vi.spyOn(request.body!, 'getReader');
        await expect(readAccountJson(request)).rejects.toThrow('Os dados enviados excedem o limite de 64 KiB.');
        expect(read).not.toHaveBeenCalled();
    });

    it('aceita exatamente o limite de bytes', async () => {
        const body = '"' + 'a'.repeat(MAX_ACCOUNT_BODY_SIZE - 2) + '"';
        const request = new Request('http://localhost/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
        expect(await readAccountJson(request)).toBe('a'.repeat(MAX_ACCOUNT_BODY_SIZE - 2));
    });

    it('rejeita stream que não termina no deadline e o cancela', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const request = new Request('http://localhost/api/profile', {
            method: 'PUT', headers: { 'content-type': 'application/json' },
            body: new ReadableStream<Uint8Array>({ cancel }), duplex: 'half',
        } as RequestInit);
        const result = expect(readAccountJson(request)).rejects.toThrow('O envio dos dados excedeu o tempo permitido.');
        await vi.advanceTimersByTimeAsync(ACCOUNT_BODY_TIMEOUT_MS);
        await result;
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('rejeita UTF-8 inválido sem detalhes raw', async () => {
        const request = new Request('http://localhost/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: new Uint8Array([0xff]) });
        await expect(readAccountJson(request)).rejects.toThrow('O JSON enviado é inválido.');
    });
});
