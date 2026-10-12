import { readdir, unlink, realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
const root = await realpath(resolve('.next/standalone'));
let removed = 0;
async function clean(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        const within = relative(root, path);
        if (within.startsWith('..') || isAbsolute(within)) throw new Error('INVALID_BUILD_PATH');
        if (entry.isDirectory()) await clean(path);
        else if (/^\.env(?:\.|$)/.test(entry.name)) { await unlink(path); removed++; }
    }
}
await clean(root);
console.info(JSON.stringify({ event: 'build_environment_sanitized', envFilesRemoved: removed }));
