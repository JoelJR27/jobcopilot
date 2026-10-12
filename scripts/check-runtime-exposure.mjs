import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import 'dotenv/config';
const packages = ['lodash', 'deepmerge-ts', 'mysql2', 'fast-uri'];
async function files(path) {
    const entries = await readdir(path, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]))).flat();
}
const traces = (await files('.next/server')).filter((path) => path.endsWith('.nft.json'));
if (!traces.length) throw new Error('BUILD_TRACES_MISSING');
const traced = [];
for (const path of traces) {
    const data = JSON.parse(await readFile(path, 'utf8'));
    traced.push(...data.files.map((file) => resolve(dirname(path), file).replaceAll('\\', '/')));
}
const standalone = await files('.next/standalone');
const matches = [];
for (const name of packages) {
    const expression = new RegExp('/node_modules/' + name + '(/|$)');
    const traceCount = traced.filter((path) => expression.test(path)).length;
    const standaloneCount = standalone.filter((path) => expression.test(path.replaceAll('\\', '/'))).length;
    matches.push({ package: name, traceCount, standaloneCount });
}
const environmentFiles = standalone.filter((path) => /(?:^|[\\/])\.env(?:\.|$)/.test(path));
const tracedEnvironmentFiles = [...new Set(traced.filter((path) => /(?:^|[\\/])\.env(?:\.|$)/.test(path)))];
const secrets = ['DATABASE_URL', 'DIRECT_DATABASE_URL', 'B2_KEY_ID', 'B2_APPLICATION_KEY', 'CRON_SECRET', 'INTERNAL_JOBS_SECRET', 'RATE_LIMIT_KEY_SECRET', 'SEED_ADMIN_PASSWORD'].map((name) => process.env[name]).filter((value) => value && value.length >= 12);
const embeddedSecretFiles = [];
for (const path of standalone.filter((file) => /\.(?:js|json|html)$/.test(file))) {
    const content = await readFile(path, 'utf8');
    if (secrets.some((value) => content.includes(value))) embeddedSecretFiles.push(path);
}
const exposed = matches.some((entry) => entry.traceCount || entry.standaloneCount) || environmentFiles.length > 0 || tracedEnvironmentFiles.length > 0 || embeddedSecretFiles.length > 0;
console.info(JSON.stringify({ event: 'runtime_dependency_exposure', traceFiles: traces.length, tracedFiles: new Set(traced).size, standaloneFiles: standalone.length, packages: matches, environmentFiles, tracedEnvironmentFiles, embeddedSecretFiles, exposed }));
if (exposed) process.exitCode = 1;
