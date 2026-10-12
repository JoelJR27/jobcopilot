import { MAX_RESUME_SIZE } from '@/application/resume/validate-resume-file';
import { ValidationError } from '@/shared/errors/validation-error';

// Margem para boundary, headers multipart e campos pequenos; arquivo continua limitado a 5 MiB.
export const MAX_RESUME_REQUEST_SIZE = MAX_RESUME_SIZE + 64 * 1024;
export const RESUME_BODY_TIMEOUT_MS = 20_000;

export async function readResumeFormData(request: Request, maximumFileSize = MAX_RESUME_SIZE): Promise<FormData> {
    const maximumRequestSize = Math.min(MAX_RESUME_SIZE, maximumFileSize) + 64 * 1024;
    const length = request.headers.get('content-length');
    if (length !== null && Number(length) > maximumRequestSize) {
        throw new ValidationError('O formulário de envio do currículo é muito grande.');
    }

    if (!request.body) throw new ValidationError('O formulário de envio do currículo é inválido.');
    const reader = request.body.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ValidationError('O envio do currículo excedeu o tempo permitido.')), RESUME_BODY_TIMEOUT_MS);
    });

    try {
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
            const { done, value } = await Promise.race([reader.read(), deadline]);
            if (done) break;
            total += value.byteLength;
            if (total > maximumRequestSize) {
                throw new ValidationError('O formulário de envio do currículo é muito grande.');
            }
            chunks.push(value);
        }

        const content = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            content.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return await Promise.race([
            new Response(content, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData(),
            deadline,
        ]);
    } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw new ValidationError('O formulário de envio do currículo é inválido.');
    } finally {
        clearTimeout(timer);
        // Não aguardar cancelamento de uma fonte externa que pode estar bloqueada.
        void reader.cancel().catch(() => {});
    }
}
