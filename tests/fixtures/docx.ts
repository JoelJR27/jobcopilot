import { deflateRawSync } from 'node:zlib';

export interface ZipEntryFixture {
    name: string;
    content?: string | Uint8Array;
    method?: 0 | 8;
    declaredSize?: number;
    flags?: number;
    descriptor?: boolean;
}

function checksum(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// ZIP32 real (headers, CRC, payloads, diretório e EOCD); sem biblioteca extra.
export function makeZip(entries: ZipEntryFixture[], comment = ''): Uint8Array {
    const locals: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.name);
        const content = Buffer.from(entry.content ?? '<test/>');
        const method = entry.method ?? 8;
        const compressed = method === 8 ? deflateRawSync(content) : content;
        const size = entry.declaredSize ?? content.length;
        const crc = checksum(content);
        const flags = (entry.flags ?? 0x800) | (entry.descriptor ? 8 : 0);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(flags, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt32LE(entry.descriptor ? 0 : crc, 14);
        local.writeUInt32LE(entry.descriptor ? 0 : compressed.length, 18);
        local.writeUInt32LE(entry.descriptor ? 0 : size, 22);
        local.writeUInt16LE(name.length, 26);
        const descriptor = Buffer.alloc(entry.descriptor ? 16 : 0);
        if (entry.descriptor) {
            descriptor.writeUInt32LE(0x08074b50, 0);
            descriptor.writeUInt32LE(crc, 4);
            descriptor.writeUInt32LE(compressed.length, 8);
            descriptor.writeUInt32LE(size, 12);
        }
        const record = Buffer.concat([local, name, compressed, descriptor]);
        locals.push(record);

        const header = Buffer.alloc(46);
        header.writeUInt32LE(0x02014b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(20, 6);
        header.writeUInt16LE(flags, 8);
        header.writeUInt16LE(method, 10);
        header.writeUInt32LE(crc, 16);
        header.writeUInt32LE(compressed.length, 20);
        header.writeUInt32LE(size, 24);
        header.writeUInt16LE(name.length, 28);
        header.writeUInt32LE(offset, 42);
        central.push(Buffer.concat([header, name]));
        offset += record.length;
    }
    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(Buffer.byteLength(comment), 20);
    return new Uint8Array(Buffer.concat([...locals, directory, end, Buffer.from(comment)]));
}

export function docxEntries(): ZipEntryFixture[] {
    return [
        { name: '[Content_Types].xml', content: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
        { name: 'word/document.xml', content: '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Currículo de teste</w:t></w:r></w:p></w:body></w:document>' },
    ];
}

export function makeDocx(): Uint8Array {
    return makeZip(docxEntries());
}
