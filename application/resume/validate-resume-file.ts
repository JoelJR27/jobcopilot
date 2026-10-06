import { ValidationError } from "@/shared/errors/validation-error";

const MAX_RESUME_SIZE = 5 * 1024 * 1024;

const PDF_MIME_TYPE = 'application/pdf';

const DOCX_MIME_TYPE =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const ALLOWED_MIME_TYPES = new Set([
    PDF_MIME_TYPE,
    DOCX_MIME_TYPE,
]);

const PDF_SIGNATURE = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d,
]);

const ZIP_SIGNATURE = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04,
]);

function startsWith(
    content: Uint8Array,
    signature: Uint8Array,
): boolean {
    return signature.every(
        (byte, index) => content[index] === byte,
    );
}

export function validateResumeFile(input: {
    content: Uint8Array;
    mimeType: string;
}): void {
    if (input.content.byteLength > MAX_RESUME_SIZE) {
        throw new ValidationError(
            'O currículo deve possuir no máximo 5 MB.',
            'RESUME_FILE_TOO_LARGE',
        );
    }

    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
        throw new ValidationError(
            'O currículo deve estar no formato PDF ou DOCX.',
            'INVALID_RESUME_FILE_TYPE',
        );
    }

    if (
        input.mimeType === PDF_MIME_TYPE &&
        !startsWith(input.content, PDF_SIGNATURE)
    ) {
        throw new ValidationError(
            'O conteúdo do arquivo PDF é inválido.',
            'INVALID_PDF_FILE',
        );
    }

    if (
        input.mimeType === DOCX_MIME_TYPE &&
        !startsWith(input.content, ZIP_SIGNATURE)
    ) {
        throw new ValidationError(
            'O conteúdo do arquivo DOCX é inválido.',
            'INVALID_DOCX_FILE',
        );
    }
}