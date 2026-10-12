import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const git = (args) => { const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }); if (result.status) throw new Error('SECRET_AUDIT_FAILED'); return result.stdout; };
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bAKIA[A-Z0-9]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, /\b(?:B2_APPLICATION_KEY|CRON_SECRET|INTERNAL_JOBS_SECRET|DATABASE_URL|PASSWORD)[ \t]*[=:][ \t]*["']?([^\s"'`;]{20,})/g];
function suspicious(content) {
    return patterns.some((pattern) => {
        pattern.lastIndex = 0;
        for (const match of content.matchAll(new RegExp(pattern.source, 'g'))) {
            const value = match[1];
            if (!value || (!/synthetic|fixture|example|process\.env|z\.|postgres(?:ql)?:\/\/localhost|\$\{|test-only/i.test(value) && !/^(INTERNAL_JOBS_SECRET|CRON_SECRET)[.,)]?$/.test(value) && !/^['"<>.]/.test(value))) return true;
        }
        return false;
    });
}
const paths = git(['ls-files', '--cached', '--others', '--exclude-standard']).split(/\r?\n/).filter(Boolean);
const findings = new Set();
const localCredentialFiles = [];
for (const path of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    try {
        const content = await readFile(path, 'utf8');
        if (/\b(?:B2_APPLICATION_KEY|DATABASE_URL|CRON_SECRET|INTERNAL_JOBS_SECRET|RATE_LIMIT_KEY_SECRET|SEED_ADMIN_PASSWORD)[ \t]*=[ \t]*[^\r\n\s]+/.test(content)) {
            const ignored = spawnSync('git', ['check-ignore', '-q', path]).status === 0;
            if (ignored) localCredentialFiles.push(path); else findings.add(path);
        }
    } catch { /* configuração local ausente */ }
}
for (const path of paths) {
    if (/pnpm-lock|package-lock|\.(?:png|jpg|jpeg|ico|pdf|docx|zip)$/.test(path)) continue;
    try { if (suspicious(await readFile(path, 'utf8'))) findings.add(path); } catch { /* arquivo removido no working tree */ }
}
const commits = git(['log', '-5', '--format=%H']).trim().split(/\r?\n/).filter(Boolean);
for (const commit of commits) {
    const names = git(['show', '--format=', '--name-only', commit]).trim().split(/\r?\n/).filter(Boolean);
    for (const path of names) {
        const result = spawnSync('git', ['show', commit + ':' + path], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
        if (result.status === 0 && suspicious(result.stdout)) findings.add('recent-history:' + path);
    }
}
console.info(JSON.stringify({ event: 'repository_secret_audit', filesScanned: paths.length, commitsScanned: commits.length, possibleSecretFiles: [...findings], ignoredLocalCredentialFiles: localCredentialFiles }));
if (findings.size) process.exitCode = 1;
