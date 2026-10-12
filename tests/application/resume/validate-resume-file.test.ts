import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { MAX_RESUME_SIZE, validateResumeFile } from '@/application/resume/validate-resume-file';
import { ValidationError } from '@/shared/errors/validation-error';
import { docxEntries, makeDocx, makeZip } from '@/tests/fixtures/docx';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const validate = (content: Uint8Array) => validateResumeFile({ content, mimeType: DOCX_MIME });

describe('validateResumeFile / contêiner DOCX', () => {
    it.each([0, 8] as const)('aceita ZIP real com entries mínimas, método %s e comentário', (method) => {
        const zip = makeZip(docxEntries().map((entry) => ({ ...entry, method })), 'comentário');
        expect(() => validate(zip)).not.toThrow();
    });

    it('aceita data descriptors ZIP32', () => {
        expect(() => validate(makeZip(docxEntries().map((entry) => ({ ...entry, descriptor: true }))))).not.toThrow();
    });

    it.each([
        ['ZIP signature sem estrutura', () => new Uint8Array([0x50, 0x4b, 0x03, 0x04])],
        ['ZIP genérico', () => makeZip([{ name: 'other.txt' }, { name: 'other2.txt' }])],
        ['sem document.xml', () => makeZip([docxEntries()[0], { name: 'other.xml' }])],
        ['sem Content_Types', () => makeZip([docxEntries()[1], { name: 'other.xml' }])],
        ['entry obrigatória vazia', () => makeZip([{ ...docxEntries()[0], content: '' }, docxEntries()[1]])],
        ['truncado', () => makeDocx().slice(0, -1)],
        ['path traversal', () => makeZip([...docxEntries(), { name: '../private.txt' }])],
        ['path absoluto', () => makeZip([...docxEntries(), { name: '/private.txt' }])],
        ['path Windows', () => makeZip([...docxEntries(), { name: 'C:\\private.txt' }])],
        ['nome duplicado', () => makeZip([...docxEntries(), docxEntries()[1]])],
        ['entry encriptada', () => makeZip(docxEntries().map((entry) => ({ ...entry, flags: 1 })))],
        ['entries demais', () => makeZip([...docxEntries(), ...Array.from({ length: 255 }, (_, i) => ({ name: `extra-${i}` }))])],
        ['tamanho por entry', () => makeZip([...docxEntries(), { name: 'large.xml', declaredSize: 10 * 1024 * 1024 + 1 }])],
        ['razão de compressão', () => makeZip([...docxEntries(), { name: 'bomb.xml', content: 'a'.repeat(200_000) }])],
        ['tamanho total declarado', () => makeZip([...docxEntries(), ...Array.from({ length: 3 }, (_, i) => ({ name: `large-${i}`, content: randomBytes(100_000), declaredSize: 8 * 1024 * 1024 }))])],
    ])('rejeita %s com ValidationError controlado', (_, create) => {
        expect(() => validate(create())).toThrow(ValidationError);
        expect(() => validate(create())).toThrow('O conteúdo do arquivo DOCX é inválido.');
    });

    it.each(['local name', 'local offset', 'directory signature', 'ZIP64', 'multi disk', 'overlap', 'trailing data'])('rejeita metadados adulterados: %s', (kind) => {
        const zip = Buffer.from(makeDocx());
        const end = zip.length - 22;
        const directory = zip.readUInt32LE(end + 16);
        if (kind === 'local name') zip[30] ^= 1;
        if (kind === 'local offset') zip.writeUInt32LE(directory + 1, directory + 42);
        if (kind === 'directory signature') zip[directory] ^= 1;
        if (kind === 'ZIP64') zip.writeUInt16LE(45, directory + 6);
        if (kind === 'multi disk') zip.writeUInt16LE(1, end + 4);
        if (kind === 'overlap') {
            const second = directory + 46 + zip.readUInt16LE(directory + 28);
            zip.writeUInt32LE(0, second + 42);
        }
        expect(() => validate(kind === 'trailing data' ? Buffer.concat([zip, Buffer.from('unexpected')]) : zip)).toThrow(ValidationError);
    });

    it('limita tamanho mesmo fora do adapter HTTP', () => {
        expect(() => validateResumeFile({ content: new Uint8Array(MAX_RESUME_SIZE + 1), mimeType: 'application/pdf' }))
            .toThrow('O currículo deve possuir no máximo 5 MB.');
    });
});
