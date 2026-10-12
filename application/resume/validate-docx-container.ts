// Inspeção do contêiner ZIP, sem extrair/descompactar arquivos ou interpretar XML.
// Um futuro parser deve limitar também os bytes efetivamente descompactados.
const MAX_ENTRIES = 256;
const MAX_ENTRY_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const REQUIRED_ENTRIES = new Set(['[Content_Types].xml', 'word/document.xml']);

export function isValidDocxContainer(content: Uint8Array): boolean {
    try {
        return inspectContainer(content);
    } catch {
        // Offsets, nomes e metadados externos inválidos não vazam erros de parsing.
        return false;
    }
}

function inspectContainer(content: Uint8Array): boolean {
    const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
    const u16 = (offset: number) => view.getUint16(offset, true);
    const u32 = (offset: number) => view.getUint32(offset, true);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const nameAt = (offset: number, length: number) => decoder.decode(content.subarray(offset, offset + length));

    // EOCD deve terminar no fim do arquivo, incluindo seu comentário limitado a 64 KiB.
    let end = -1;
    for (let offset = content.length - 22; offset >= Math.max(0, content.length - 22 - 65535); offset -= 1) {
        if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === content.length) {
            end = offset;
            break;
        }
    }

    if (end < 0 || u16(end + 4) !== 0 || u16(end + 6) !== 0) return false;
    const count = u16(end + 10);
    const directorySize = u32(end + 12);
    const directoryOffset = u32(end + 16);
    if (count < 2 || count > MAX_ENTRIES || u16(end + 8) !== count || directoryOffset + directorySize !== end) return false;

    let cursor = directoryOffset;
    let totalSize = 0;
    const names = new Set<string>();
    const ranges: { start: number; end: number }[] = [];

    for (let index = 0; index < count; index += 1) {
        if (cursor + 46 > end || u32(cursor) !== 0x02014b50) return false;
        const flags = u16(cursor + 8);
        const method = u16(cursor + 10);
        const crc = u32(cursor + 16);
        const compressedSize = u32(cursor + 20);
        const size = u32(cursor + 24);
        const nameLength = u16(cursor + 28);
        const next = cursor + 46 + nameLength + u16(cursor + 30) + u16(cursor + 32);
        const local = u32(cursor + 42);
        if (
            next > end || nameLength === 0 || nameLength > 512 ||
            u16(cursor + 6) > 20 || u16(cursor + 34) !== 0 ||
            (flags & (1 | 0x40 | 0x2000)) !== 0 || ![0, 8].includes(method) ||
            size > MAX_ENTRY_SIZE || compressedSize > content.length ||
            size > Math.max(1, compressedSize) * MAX_COMPRESSION_RATIO ||
            (method === 0 && compressedSize !== size) ||
            ((u32(cursor + 38) >>> 16) & 0xf000) === 0xa000
        ) return false;

        totalSize += size;
        if (totalSize > MAX_TOTAL_SIZE) return false;
        const name = nameAt(cursor + 46, nameLength);
        if (
            names.has(name) || name.startsWith('/') || name.includes('\\') || name.includes(':') ||
            name.includes('\0') || name.split('/').some((part) => part === '..' || part === '.') ||
            (REQUIRED_ENTRIES.has(name) && (size === 0 || compressedSize === 0))
        ) return false;
        names.add(name);

        // O diretório não pode inventar entries: confirmar header local, nome e intervalo.
        if (local + 30 > directoryOffset || u32(local) !== 0x04034b50) return false;
        const localNameLength = u16(local + 26);
        const payload = local + 30 + localNameLength + u16(local + 28);
        let entryEnd = payload + compressedSize;
        if (
            u16(local + 4) > 20 || u16(local + 6) !== flags || u16(local + 8) !== method ||
            localNameLength !== nameLength || nameAt(local + 30, localNameLength) !== name ||
            entryEnd > directoryOffset
        ) return false;

        if ((flags & 8) === 0) {
            if (u32(local + 14) !== crc || u32(local + 18) !== compressedSize || u32(local + 22) !== size) return false;
        } else {
            // Suportar data descriptor ZIP32 com e sem assinatura.
            const descriptor = entryEnd + (u32(entryEnd) === 0x08074b50 ? 4 : 0);
            entryEnd = descriptor + 12;
            if (
                entryEnd > directoryOffset || u32(descriptor) !== crc ||
                u32(descriptor + 4) !== compressedSize || u32(descriptor + 8) !== size
            ) return false;
        }
        ranges.push({ start: local, end: entryEnd });
        cursor = next;
    }

    if (cursor !== end || ![...REQUIRED_ENTRIES].every((name) => names.has(name))) return false;
    ranges.sort((a, b) => a.start - b.start);
    // Recusar payloads sobrepostos, prefixos executáveis e dados fora das entries.
    return ranges[0].start === 0 && ranges.every((range, index) =>
        range.end === (ranges[index + 1]?.start ?? directoryOffset));
}
