# JobCopilot — Codex Handoff

## Estado autoritativo — release 2026-10-12

Ler primeiro docs/PHASE_8_RELEASE_REPORT.md, docs/BACKEND_PRODUCTION_CHECKLIST.md e docs/BACKUP_SETUP.md. Backend ativado e verificado em https://jobcopilot-zeta.vercel.app, alpha pessoal/não comercial Vercel Hobby;5/5migrations, ADMIN bootstrap, runtime DB least-privilege/TLS, key B2 Production privada/restrita e crons jobs06UTC/GC07UTC ativos. Smoke USER A/B/ADMIN sintéticos/cross-user/429 compartilhado/503 isolado e gates remotos passaram. Nenhum secret/PII necessário nos relatórios.

Backup GitHub Actions/B2 privado separado, AES-GCM/custom pg_dump/retenção >7dias, restore13tabelas/5migrations isolado comprovado. Incidente25h49 no cron diário não foi omitido; operador autorizou watchdog horário23 * * * * com refresh23h e aceitou best-effort. Manifesto HMAC e replay fresco verificados; monitorar idade/RPO≤24h, não assumir SLA nem primeiro evento horário automático já observado.

Exceção explícita autorizada: cap HTTP4MiB quando VERCEL=1, pois Vercel rejeita requests >4,5MB antes do handler. Domínio continua5MiB; compensação B2/DB e arquitetura preservadas. Keys B2 antigas mantidas para revisão manual por decisão explícita; não revogar sem nova autorização.

Snapshot validado publicado no Git remoto, preservando HEAD/working tree local; alterações históricas abaixo não devem ser reimplementadas. **Backend/arquitetura/features congelados.** Próxima fase somente Frontend Production Readiness mediante novo pedido. Não iniciar features backend/LLM/auto-apply. Seções anteriores abaixo são histórico de decisões e fases, não status de Production.

**Last updated:** 2026-10-07

This file is a continuation handoff from the ChatGPT development session for JobCopilot.

Before changing code:

1. Read `/AGENTS.md`.
2. Inspect the actual repository and confirm file names/signatures.
3. Prefer the repository's existing implementation over assumptions in this document if small syntactic differences exist.
4. Do not change fixed architectural decisions without explicit user approval.

---

## Where development stopped

Latest stage: PHASE_6_REPORT.md records Swile/Lever (29 persisted, 14 Brazil-first, replay zero), reusable LeverJobCollector (ciandt/swile; old CiandtJobCollector removed), feedback PUT and controls, and server-guarded minimal admin metrics/source toggles. Ineligible matches are now hidden with geographyRank=3, preserving feedback; no deletion by pipeline. DTO includes own JobMatch.id needed for feedback, never owner/job IDs. Sources ordered CI&T/Swile/Arbeitnow; Arbeitnow originals preserved with 13 new rows (338 total). Platform confirmed Vercel: vercel.json daily 06:00 UTC, GET cron adapter uses same Bearer protection as POST; CRON_SECRET must equal INTERNAL_JOBS_SECRET. Scheduler is NOT deployed/active remotely. Hardening auth CSRF/body/password limits/local rate/no-store, DB/B2 controlled config/timeouts, headers; private bucket ACL has no public grant. Next patched to 16.3.8, Node types24; Prisma7.10/Zod4 preserved. Final 410 tests (26 PG), typecheck/lint/build/diff passed. Audit still has 3 high/4 moderate Prisma transitives and is a deploy-review blocker. Other blockers: production env/DB/cron activation, local-only rate limits, authentication UI, browser smoke/throughput/CSP. No LLM/auto apply/realtime/queues. Earlier notes below are historical reference.

Latest authorized stage: Brazil-first source + deterministic matching + real /jobs + daily pipeline adapters completed; details in docs/PHASE_5_REPORT.md. CI&T/Lever is the primary configured collector (174 Brazilian jobs persisted, 205 total; replay inserts zero). Arbeitnow remains secondary with its 325 rows preserved. Gate excludes geography unknown/foreign-only; remote Brazil and explicit LATAM/worldwide accepted. JobMatch.geographyRank additive migration is applied locally. Weights 30/35/15/10/10, upsert owner+job; authenticated /jobs and GET /api/jobs expose only session-owner matches. Run pnpm jobs:run; POST /api/internal/jobs/run requires server-only INTERNAL_JOBS_SECRET header, never session role/query. Shared PostgreSQL advisory lock + local HTTP cooldown. Daily cron setup is prepared in docs/DAILY_JOBS_SETUP.md, but production scheduler is not activated because deploy platform is unspecified. Full suite 357 tests passed, build/typecheck/lint/diff passed. No LLM/feedback. Historical stage-four notes below remain reference, not latest /jobs state.

Production roadmap: **onboarding + first collector + job persistence/dedupe** are implemented and verified together as explicitly requested by the user (Fases 5/6 of the production plan). No matching/enrichment/scheduler/admin was started. Earlier Auth/Resume/Profile/Preferences implementations were preserved.

Current collection/onboarding state:

- `/onboarding` authenticates server-side, calls `GetOnboardingProgress` with session userId and exposes only completion booleans. It links to Profile/Preferences, offers initial résumé upload through the existing POST API, and enables `/jobs` only after all steps are complete.
- `/jobs` is only an authenticated landing placeholder to avoid a broken onboarding destination; no listing/ranking/matching is implemented.
- One real collector: Arbeitnow public JSON API at the fixed configured endpoint. It requires no key and costs nothing; platform backlinks are present. Coverage is mainly European and must be considered when validating relevance.
- Collector guards: HTTPS/fixed source, zero redirects, 15s deadline per attempt including response stream, at most one retry with 750ms backoff for network/timeout/5xx without Retry-After; no immediate retry on 429/Retry-After; status/content-type/schema checks; 4 MiB actual-byte response limit; 1000-job cap.
- Job URLs must belong to four preconfigured Arbeitnow regional hosts; they are never fetched. Feed pagination/next URLs are ignored. Text/HTML from descriptions is stored as untrusted text and never executed/rendered as HTML.
- `CollectJobs` normalizes/validates before writing, persists batches of 100 and reports collected/inserted/duplicates. `PrismaJobRepository` uses createMany+skipDuplicates and both existing source-qualified unique constraints. Existing jobs are never deleted or refreshed by absence in feed.
- `JobSource` is atomically ensured by name, with active=false respected. Stored baseUrl is metadata, never the source of a fetch URL. No schema/migration/new entity/dependency was added.
- Run manually from root: `pnpm jobs:collect`. CLI uses Node 24 directly and fixed/sanitized logs; no HTTP trigger, cron or full matching pipeline.
- Real execution against the configured local app DB collected/inserted **325 jobs**. A second real run collected 325, inserted **0**, duplicates **325**. These public Job/JobSource rows remain in the app DB intentionally; user/private tables were not changed.
- Verification: 65 focused tests, 9 isolated PostgreSQL tests for this stage, complete suite 291 tests passed; typecheck, full lint, build and diff-check passed. After an onboarding JSX lint fix, affected page tests/typecheck/lint/build were repeated successfully. Sandbox network failures were retried with authorization, without raw response/error logs.

Detailed source rationale, all files, commands, security checklist and debts: `docs/PHASE_4_REPORT.md`.

Next work is matching/enrichment according to the roadmap, but it was not authorized or implemented here.

### Previous completed phase: Profile + Preferences

Current professional data flow:

- `GET/PUT /api/profile`, `GET/PUT /api/preferences`, `/profile`, `/preferences` are implemented using existing Prisma models, no migration/new entity/dependency.
- All handlers require session authentication. Read/upsert target only `user.id`; body/query identity and roles are ignored. ADMIN uses its own data with no cross-user privilege.
- Domain schemas use Zod v4/PT-BR. JSON fields are bounded string lists (one item per line in UI), not arbitrary JSON. Seniority uses INTERN/JUNIOR/MID/SENIOR/LEAD; work models use REMOTE/HYBRID/ONSITE.
- Minimum save: Profile needs headline, skills, roles, seniority. Preferences need desiredRoles, seniority, workModels; HYBRID/ONSITE also need locations. Optional fields default to empty text/lists. PUT is a full replacement of editable fields.
- JSON body capped at 64 KiB of actual bytes with 10s read deadline; mutations reject cross-site/invalid origin and non-JSON content types. All API responses, including errors, use `Cache-Control: no-store`; outputs contain only professional fields, no IDs/owner/timestamps/secrets.
- Ports/use cases are under `application/profile` and `application/preferences`. Prisma repositories receive the client through composition and use atomic upsert on unique userId; explicit field mapping prevents mass assignment.
- Pages are explicitly dynamic and authenticate server-side. Client editors fetch same-origin APIs, validate fields, render text only, handle loading/errors/save feedback and block editing until data successfully loads. Client requests timeout after 15s. No login UI was added; without session, pages show a controlled login-required message.
- Verification: 86 focused tests, 3 isolated PostgreSQL tests for this feature, full suite 217 tests (including all PostgreSQL/B2 tests) passed; typecheck, full lint, build and diff-check passed. B2 required an authorized rerun after sandbox EACCES.

Detailed limits, all changed files, security checklist and debts: `docs/PHASE_3_REPORT.md`.

The originally recorded next step (onboarding) is now completed as described above.

### Previous completed phase: Resume

Current résumé hardening:

- Multipart input is read with an actual-byte cap of 5 MiB + 64 KiB overhead and a 20-second read/parse deadline before parsing. File limit remains 5 MiB and is checked again in the application.
- DOCX now requires a coherent ZIP32 directory and local headers, nonempty `[Content_Types].xml` / `word/document.xml`, safe nonduplicate names, supported methods 0/8 and no encryption. Limits: 256 entries, 10 MiB per declared expanded entry, 20 MiB declared expanded total, compression ratio 100:1.
- This is container inspection only: no extraction/decompression, XML parsing or payload CRC validation. A future parser must validate actual expanded bytes and contents independently. The old four-byte DOCX fixture in historical sections is no longer accepted.
- Compensation B2/DB remains in place. Failure to delete the new object after a DB error no longer masks the original DB error; all upload logs are fixed messages without raw errors. Old-object deletion failure still preserves the successful replacement.
- An explicit application ownership check rejects a repository result belonging to another user before storage access.
- Success metadata uses `Cache-Control: no-store`; `storageKey` and client identity are not exposed. PDF/DOCX normal flows and cross-user isolation are tested for USER and ADMIN.
- The existing 10-attempts/user/hour limiter remains per-process memory, resets on restart and is not distributed. It is provisional for alpha.
- Final verification: 121 offline tests passed (including résumé/HTTP), 4 PostgreSQL integration tests stayed opt-in/skipped; typecheck, full lint and diff-check passed. Storage adapter/configuration did not change; no B2 integration was needed or executed.

Detailed changed files, security checklist and remaining debts: `docs/PHASE_2_REPORT.md`.

The next step originally recorded here (Profile) is now completed with Preferences as documented above.

### Previous completed phase: roles + seed

- `UserRole` adds USER (default) and ADMIN through `20261007000000_add_user_role`.
- Authenticated user/login/cadastro return public `id`, `email`, `role`; registration always persists USER and ignores client role/identity.
- `requireAdminUser()` validates the database-backed authenticated user's role server-side. Missing/invalid sessions raise `UnauthorizedError` (401 convention); authenticated non-admin users raise `ForbiddenError` (403 convention). No `/admin` route exists yet; it belongs to Fase 12.
- The admin seed uses `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, validates them separately from runtime envs, hashes with bcrypt and atomically upserts by email. Existing passwords are preserved. USER → ADMIN promotion revokes only that user's sessions in the same transaction; repeated seed for ADMIN preserves sessions.
- `prisma7.config.ts` remains the actual config filename. Use `pnpm db:generate`, `pnpm db:migrate:deploy`, `pnpm db:seed` from repository root. All scripts explicitly pass this config.
- Seed runs directly on Node 24. Prisma-generated imports use `.ts` and TypeScript allows these extensions; no new dependency was installed.
- `.env.example` contains only blank values and is explicitly allowed by `.gitignore`. Seed-only envs are not required for normal runtime.
- Verification: 78 offline tests passed; 4 PostgreSQL integration tests passed in a temporary isolated local schema; full lint, typecheck and Prisma validate passed. The integration suite is opt-in (`JOBCOPILOT_DB_TESTS=1`) and refuses non-local PostgreSQL.
- The migration and seed were **not** run against normal application tables. Apply the migration before running the app with the updated Prisma Client, and execute bootstrap only when the intended seed credentials are configured.

Detailed changed files, security checklist and remaining debts: `docs/PHASE_1_REPORT.md`.

The original next step (Fase 2) is now completed as documented above. Other production hardening remains assigned to subsequent roadmap phases.

The following résumé notes and code examples are historical reference; current roles/signatures should be confirmed in the repository.

The résumé HTTP upload flow is now implemented and tested:

```text
POST /api/resumes
```

The current route path is:

```text
app/api/resumes/route.ts
```

The endpoint connects `requireAuthenticatedUser()` to the existing `UploadResume` use case. The previous singular `app/api/resume/route.ts` was moved to this path.

Current additions:

- Exported `MAX_RESUME_SIZE`; oversized files are rejected before `file.arrayBuffer()` while application validation remains in place.
- Unsupported content types and malformed multipart bodies return controlled 400 responses.
- Cross-origin / cross-site browser requests return 403.
- A local per-process limit allows 10 upload attempts per authenticated user per hour; excess attempts return 429 with `Retry-After`. It resets on process restart and is not shared across instances.
- Success returns 201 with only the public résumé metadata, never `storageKey` or `userId`.
- Unexpected HTTP failures return a generic 500 and log a fixed message without raw infrastructure errors.
- `tests/app/api/resumes/route.test.ts` exercises the real application use case with mocked authentication, repository and storage, without external services.

Validation: 29 résumé tests passed, TypeScript and scoped ESLint passed.

Next, assess which résumé read/update flows the UI requires. No additional HTTP flows, extraction, job processing or scheduler were added in this step.

Sections below preserve the earlier implementation reference; sections 11–14 describe the endpoint and tests that are now completed.

Do **not** jump to the GC scheduler yet.

---

# 1. Current architecture

JobCopilot is currently a single full-stack Next.js application.

There is no separate NestJS backend in the MVP.

Backend HTTP endpoints live under:

```text
app/api/**/route.ts
```

Business logic lives outside `app/`:

```text
application/
domain/
infrastructure/
shared/
```

The repository currently does not use a `src/` folder.

The TypeScript alias is based on the repository root:

```json
{
  "paths": {
    "@/*": ["./*"]
  }
}
```

---

# 2. Current stack

Known current versions/context:

```text
Next.js       16.x
TypeScript    5.9.x
Node.js       24.14.x
Prisma        7.10.0
@prisma/client 7.10.0
Vitest        5.0.0
Zod           v4
Package mgr   pnpm
Database      PostgreSQL
Storage       Backblaze B2
```

Prisma 7 is intentional.

Do not use Prisma 8-specific CLI guidance.

---

# 3. Auth status

Registration/login/logout/session handling and `/api/auth/me` have already been implemented and tested.

Known existing auth composition:

```text
infrastructure/composition/auth.ts
```

Known helper:

```text
infrastructure/auth/session/require-authenticated-user.ts
```

Current implementation:

```ts
import { getSessionId } from '@/infrastructure/auth/session/session-cookie';
import { makeGetCurrentUser } from '@/infrastructure/composition/auth';

export async function requireAuthenticatedUser() {
    const sessionId = await getSessionId();

    const getCurrentUser = makeGetCurrentUser();

    return getCurrentUser.execute(sessionId);
}
```

Therefore protected Route Handlers should obtain the authenticated user through this helper rather than reading a `userId` from the request.

Known session duration:

```ts
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
```

Known cookie rules:

- HttpOnly
- Secure in production
- SameSite=Lax
- path `/`

---

# 4. Résumé ports

## `application/resume/ports/resume-repository.ts`

Current interface:

```ts
export interface ResumeRepository {
    findByUserId(userId: string): Promise<{
        id: string;
        userId: string;
        fileName: string;
        storageKey: string;
        mimeType: string;
        fileSize: number;
    } | null>;

    create(data: {
        userId: string;
        fileName: string;
        storageKey: string;
        mimeType: string;
        fileSize: number;
    }): Promise<{
        id: string;
        userId: string;
        fileName: string;
        storageKey: string;
        mimeType: string;
        fileSize: number;
        status: string;
    }>;

    update(
        id: string,
        data: {
            fileName: string;
            storageKey: string;
            mimeType: string;
            fileSize: number;
        },
    ): Promise<{
        id: string;
        userId: string;
        fileName: string;
        storageKey: string;
        mimeType: string;
        fileSize: number;
        status: string;
    }>;
}
```

## `application/resume/ports/resume-maintenance-repository.ts`

Current interface:

```ts
export interface ResumeMaintenanceRepository {
    listStorageKeys(): Promise<string[]>;
}
```

The separation between normal and maintenance repository operations is intentional.

## `application/resume/ports/resume-storage.ts`

Conceptual current contract:

```ts
export interface ResumeStorage {
    save(input: {
        key: string;
        content: Uint8Array;
        contentType: string;
    }): Promise<void>;

    get(key: string): Promise<Uint8Array | null>;

    delete(key: string): Promise<void>;
}
```

## `application/resume/ports/resume-storage-maintenance.ts`

Current contract:

```ts
export interface ResumeStorageMaintenance {
    listVersions(
        prefix: string,
    ): Promise<
        {
            key: string;
            versionId: string;
            isDeleteMarker: boolean;
            lastModified: Date;
        }[]
    >;

    deleteVersion(
        key: string,
        versionId: string,
    ): Promise<void>;
}
```

---

# 5. Current `UploadResume`

File:

```text
application/resume/upload-resume.ts
```

Current code:

```ts
import { randomUUID } from 'node:crypto';

import type { ResumeRepository } from './ports/resume-repository';
import type { ResumeStorage } from './ports/resume-storage';

import { validateResumeFile } from './validate-resume-file';

interface UploadResumeInput {
    userId: string;
    fileName: string;
    mimeType: string;
    content: Uint8Array;
}

export class UploadResume {
    constructor(
        private readonly resumeRepository: ResumeRepository,
        private readonly resumeStorage: ResumeStorage,
    ) { }

    async execute(input: UploadResumeInput) {
        validateResumeFile({
            content: input.content,
            mimeType: input.mimeType,
        });

        const currentResume =
            await this.resumeRepository.findByUserId(input.userId);

        const extension =
            input.mimeType === 'application/pdf'
                ? 'pdf'
                : 'docx';

        const newStorageKey =
            `resumes/${input.userId}/${randomUUID()}.${extension}`;

        await this.resumeStorage.save({
            key: newStorageKey,
            content: input.content,
            contentType: input.mimeType,
        });

        let resume;

        try {
            resume = currentResume
                ? await this.resumeRepository.update(
                    currentResume.id,
                    {
                        fileName: input.fileName,
                        storageKey: newStorageKey,
                        mimeType: input.mimeType,
                        fileSize: input.content.byteLength,
                    },
                )
                : await this.resumeRepository.create({
                    userId: input.userId,
                    fileName: input.fileName,
                    storageKey: newStorageKey,
                    mimeType: input.mimeType,
                    fileSize: input.content.byteLength,
                });
        } catch (error) {
            await this.resumeStorage.delete(newStorageKey);

            throw error;
        }

        if (currentResume) {
            try {
                await this.resumeStorage.delete(
                    currentResume.storageKey,
                );
            } catch (error) {
                console.error(
                    'Não foi possível remover o currículo anterior do storage.',
                    error,
                );
            }
        }

        return resume;
    }
}
```

Important:

- Do not rewrite this use case merely to make its constructor match another use case.
- Its two positional dependencies are currently valid and working.
- The storage extension derives from MIME, not the original filename.
- `validateResumeFile()` runs before the ternary that chooses PDF/DOCX, so unsupported MIME types do not silently become DOCX.

---

# 6. Current résumé validator

File:

```text
application/resume/validate-resume-file.ts
```

Current code:

```ts
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
```

Recommended small adjustment during the HTTP endpoint work:

Change:

```ts
const MAX_RESUME_SIZE = 5 * 1024 * 1024;
```

to:

```ts
export const MAX_RESUME_SIZE = 5 * 1024 * 1024;
```

Reason:

The Route Handler can reject a too-large `File` before calling `arrayBuffer()`, while the application validator still remains the authoritative rule.

Do **not** remove the size validation from `validateResumeFile()`.

Known hardening note:

The DOCX signature check only validates that the content starts like a ZIP. A generic ZIP can pass this check. True DOCX structure validation may be added later by checking required ZIP entries such as `[Content_Types].xml` and `word/document.xml`.

Do not over-engineer that before the current HTTP flow works.

---

# 7. B2 storage implementation

File:

```text
infrastructure/storage/b2/b2-resume-storage.ts
```

Current implementation includes:

```ts
import {
    DeleteObjectCommand,
    GetObjectCommand,
    ListObjectVersionsCommand,
    PutObjectCommand,
} from '@aws-sdk/client-s3';

import type { ResumeStorage } from '@/application/resume/ports/resume-storage';
import type { ResumeStorageMaintenance } from '@/application/resume/ports/resume-storage-maintenance';

import { env } from '@/shared/config/env';

import { b2Client } from './client';

export class B2ResumeStorage
    implements ResumeStorage, ResumeStorageMaintenance {

    async save(input: {
        key: string;
        content: Uint8Array;
        contentType: string;
    }): Promise<void> {
        await b2Client.send(
            new PutObjectCommand({
                Bucket: env.B2_BUCKET_NAME,
                Key: input.key,
                Body: input.content,
                ContentType: input.contentType,
            }),
        );
    }

    async get(key: string): Promise<Uint8Array | null> {
        try {
            const response = await b2Client.send(
                new GetObjectCommand({
                    Bucket: env.B2_BUCKET_NAME,
                    Key: key,
                }),
            );

            if (!response.Body) {
                return null;
            }

            return response.Body.transformToByteArray();
        } catch (error) {
            if (
                error instanceof Error &&
                'name' in error &&
                error.name === 'NoSuchKey'
            ) {
                return null;
            }

            throw error;
        }
    }

    async delete(key: string): Promise<void> {
        await b2Client.send(
            new DeleteObjectCommand({
                Bucket: env.B2_BUCKET_NAME,
                Key: key,
            }),
        );
    }

    async listVersions(
        prefix: string,
    ): Promise<
        {
            key: string;
            versionId: string;
            isDeleteMarker: boolean;
            lastModified: Date;
        }[]
    > {
        const response = await b2Client.send(
            new ListObjectVersionsCommand({
                Bucket: env.B2_BUCKET_NAME,
                Prefix: prefix,
            }),
        );

        const versions = [
            ...(response.Versions ?? []).map((version) => ({
                key: version.Key,
                versionId: version.VersionId,
                isDeleteMarker: false,
                lastModified: version.LastModified,
            })),
            ...(response.DeleteMarkers ?? []).map((marker) => ({
                key: marker.Key,
                versionId: marker.VersionId,
                isDeleteMarker: true,
                lastModified: marker.LastModified,
            })),
        ];

        return versions.filter(
            (
                version,
            ): version is {
                key: string;
                versionId: string;
                isDeleteMarker: boolean;
                lastModified: Date;
            } =>
                typeof version.key === 'string' &&
                typeof version.versionId === 'string' &&
                version.lastModified instanceof Date,
        );
    }

    async deleteVersion(
        key: string,
        versionId: string,
    ): Promise<void> {
        await b2Client.send(
            new DeleteObjectCommand({
                Bucket: env.B2_BUCKET_NAME,
                Key: key,
                VersionId: versionId,
            }),
        );
    }
}
```

Integration tests passed successfully.

Latest observed test output:

```text
✓ infrastructure/storage/b2/b2-resume-storage.test.ts (3 tests)
  ✓ deve salvar, recuperar e excluir um arquivo
  ✓ deve retornar null quando o arquivo não existir
  ✓ deve listar versões e excluir uma versão específica

Test Files  1 passed
Tests       3 passed
```

The B2 bucket may still contain `.txt` objects and hidden versions created by older storage-only integration tests. Those are test artifacts, not evidence that TXT is supported by the résumé upload flow.

---

# 8. Garbage collector

The use case has already been implemented and its tests pass.

File:

```text
application/resume/cleanup-orphaned-resumes.ts
```

Intended logic:

```text
database current storage keys
        +
B2 versions under resumes/
        ↓
for each B2 version:
    key referenced in DB?
        yes → keep
        no  → is older than 24h?
                  no  → keep
                  yes → deleteVersion(key, versionId)
```

The 24-hour grace period is deliberate.

It prevents the cleanup process from immediately deleting files involved in a recent partial/failing operation.

Delete markers may also be removed if they are orphaned and old enough.

The cleanup is **not** invoked inside `UploadResume`.

---

# 9. Résumé composition

File:

```text
infrastructure/composition/resume.ts
```

Current intended implementation:

```ts
import { CleanupOrphanedResumes } from '@/application/resume/cleanup-orphaned-resumes';
import { UploadResume } from '@/application/resume/upload-resume';

import { PrismaResumeRepository } from '@/infrastructure/database/prisma/repositories/resume-repository';
import { B2ResumeStorage } from '@/infrastructure/storage/b2/b2-resume-storage';

export function makeUploadResume(): UploadResume {
    const resumeRepository = new PrismaResumeRepository();
    const resumeStorage = new B2ResumeStorage();

    return new UploadResume(
        resumeRepository,
        resumeStorage,
    );
}

export function makeCleanupOrphanedResumes(): CleanupOrphanedResumes {
    const resumeRepository = new PrismaResumeRepository();
    const resumeStorage = new B2ResumeStorage();

    return new CleanupOrphanedResumes({
        resumeRepository,
        resumeStorage,
    });
}
```

This factory was corrected to use two positional arguments for `UploadResume`.

---

# 10. Current database résumé rule

The schema has already been migrated so there is only one résumé row per user.

Conceptually:

```prisma
model Resume {
  id            String       @id @default(uuid())
  userId        String       @unique
  fileName      String
  storageKey    String       @unique
  mimeType      String
  fileSize      Int
  status        ResumeStatus @default(PENDING)
  extractedData Json?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  user User @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  @@index([userId, status])
}
```

One-user / one-current-résumé is a fixed MVP decision.

---

# 11. Immediate implementation: `POST /api/resumes`

Create:

```text
app/api/resumes/route.ts
```

Intended structure:

```ts
import { NextResponse } from 'next/server';

import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeUploadResume } from '@/infrastructure/composition/resume';

import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { ValidationError } from '@/shared/errors/validation-error';

export async function POST(request: Request) {
    try {
        const user = await requireAuthenticatedUser();

        const formData = await request.formData();
        const file = formData.get('file');

        if (!(file instanceof File)) {
            return NextResponse.json(
                {
                    error: 'O currículo é obrigatório.',
                },
                {
                    status: 400,
                },
            );
        }

        // Recommended:
        // reject file.size > MAX_RESUME_SIZE here before arrayBuffer(),
        // while keeping application validation as the source of truth.

        const content = new Uint8Array(
            await file.arrayBuffer(),
        );

        const uploadResume = makeUploadResume();

        const resume = await uploadResume.execute({
            userId: user.id,
            fileName: file.name,
            mimeType: file.type,
            content,
        });

        return NextResponse.json(
            {
                resume: {
                    id: resume.id,
                    fileName: resume.fileName,
                    mimeType: resume.mimeType,
                    fileSize: resume.fileSize,
                    status: resume.status,
                },
            },
            {
                status: 201,
            },
        );
    } catch (error) {
        if (error instanceof UnauthorizedError) {
            return NextResponse.json(
                {
                    error: error.message,
                },
                {
                    status: 401,
                },
            );
        }

        if (error instanceof ValidationError) {
            return NextResponse.json(
                {
                    error: error.message,
                },
                {
                    status: 400,
                },
            );
        }

        console.error(
            'Erro inesperado ao fazer upload do currículo.',
            error,
        );

        return NextResponse.json(
            {
                error: 'Não foi possível enviar o currículo.',
            },
            {
                status: 500,
            },
        );
    }
}
```

Before copying blindly, inspect the actual error classes and the exact `getCurrentUser.execute()` return shape.

If the project already has a common HTTP-error translation helper, use it rather than duplicating behavior.

Do not introduce a generic framework solely for this endpoint.

---

# 12. Endpoint rules

The client sends multipart form data with:

```text
file
```

The client does **not** send `userId`.

Use:

```ts
const user = await requireAuthenticatedUser();
```

Then:

```ts
userId: user.id
```

The endpoint must not expose:

```text
storageKey
```

Expected success payload:

```json
{
  "resume": {
    "id": "...",
    "fileName": "curriculo.pdf",
    "mimeType": "application/pdf",
    "fileSize": 128734,
    "status": "PENDING"
  }
}
```

Expected success status:

```text
201
```

---

# 13. Route tests to implement immediately afterward

Create a Route Handler test according to the repository's existing test layout.

Cover at least:

```text
no authenticated session       → 401
no file                         → 400
TXT MIME                        → 400
fake PDF content                → 400
fake DOCX content               → 400
file larger than 5 MB           → 400
valid PDF                       → 201
valid DOCX                      → 201
response exposes storageKey     → must be false
```

For Route Handler unit/integration-boundary tests:

- mock authentication;
- mock `makeUploadResume()` or the returned use case as appropriate;
- do not hit real B2/PostgreSQL unless explicitly writing an integration test.

There are already lower-level tests for the application use case and B2 integration.

Avoid duplicating those responsibilities in the Route Handler test.

---

# 14. Useful test fixtures

For a minimal PDF signature fixture:

```ts
const pdfContent = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d,
]);
```

For the current minimal DOCX/ZIP signature fixture:

```ts
const docxContent = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04,
]);
```

When testing the actual validator, these signatures are sufficient for the current implementation.

When testing only the Route Handler with the use case mocked, prefer testing HTTP concerns rather than re-testing file signatures.

---

# 15. Testing environment

Current `vitest.config.ts` is conceptually:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: 'node',
    },
});
```

This setup was needed because:

- Vitest was not automatically loading `.env` in this project setup.
- Tests need the `@/*` alias.

Do not remove these pieces unless the repository is deliberately reconfigured.

---

# 16. B2 environment variables

Current environment validation includes B2 settings such as:

```text
B2_ENDPOINT
B2_REGION
B2_KEY_ID
B2_KEY_NAME
B2_APPLICATION_KEY
B2_BUCKET_NAME
```

Do not ask the user to paste credentials or secrets into chat/output.

The B2 application key should remain bucket-restricted and least-privilege.

---

# 17. Known implementation nuance: B2 versions

A normal:

```ts
delete(key)
```

on a versioned bucket can create a delete marker and leave older versions.

Therefore storage integration tests should clean up specific versions when testing version operations.

The existing version-aware integration test now passes.

---

# 18. What comes after the résumé endpoint

After the endpoint and its tests are working:

1. consider a real endpoint/integration test if useful;
2. finish any résumé HTTP read/update flows required by the UI;
3. later decide how `CleanupOrphanedResumes` is invoked daily;
4. choose a zero-cost scheduler/deployment-compatible mechanism;
5. do not use `setInterval()` inside the Next.js runtime as the production scheduling mechanism.

Do not skip directly to a scheduler unless the résumé HTTP flow is complete.

---

# 19. Broader MVP roadmap after résumé upload

The larger MVP still needs:

```text
résumé upload
    ↓
résumé parsing/extraction
    ↓
profile review/edit
    ↓
job preferences
    ↓
daily job collection
    ↓
job normalization/dedup
    ↓
LLM enrichment
    ↓
matching
    ↓
recommendations
    ↓
relevant/not relevant feedback
```

The central validation target remains recommendation relevance.

Keep implementation choices aligned with that goal.

---

# 20. Fixed project conventions to avoid accidentally reverting

Do not casually change these:

```text
single Next.js full-stack app for MVP
no src/ directory
Next.js App Router
app/api for HTTP backend
Prisma 7
PostgreSQL
Zod v4
Zod `error:` messages in PT-BR
bcrypt
DB-backed sessions
7-day session duration
one current résumé per user
PDF + DOCX only
5 MB résumé limit
Backblaze B2 private bucket
maintenance ports separate from normal ports
24h orphan cleanup safety window
zero-cost MVP services
```

If a future task conflicts with one of these decisions, explain the conflict before editing.

---

# 21. Working style requested by the user

The user prefers architecture and code changes to remain consistent with earlier decisions.

Avoid contradictory suggestions across sessions.

When a constructor/interface already exists, inspect it before proposing factory code.

Prefer iterative changes that preserve tested behavior.

Do not over-engineer.

When giving CLI commands, make it clear where they should be run if ambiguity exists.

The user communicates in Brazilian Portuguese, so explanations and validation messages should generally remain in PT-BR.

## Atualização Fase 7 — 2026-10-08

Backend endurecido; ler docs/PHASE_7_REPORT.md, docs/BACKEND_PRODUCTION_CHECKLIST.md e docs/DEPENDENCY_EXPOSURE_REPORT.md antes de continuar. Sem frontend adicional/LLM nesta fase.

Rate limiter PostgreSQL distribuído via port comum, HMAC e teto10mil; local apenas dev/test, produção falha fechado503 sem fallback. Migration aditiva20261007020000_backend_readiness: Job.active/lastSeenAt, RateLimitBucket e JobPipelineState; cinco migrations aplicadas localmente. Lifecycle14dias após coleta válida, proteção de leitura30dias mesmo com fonte indisponível; refresh/reativação preservam JobMatch/feedback. Identidade ambígua não sobrescreve duas rows.

Pipeline deadline240s, batches50users/100jobs, bulk upsert e checkpoint na mesma transação; replay/cancelamento/parcial testados em schema isolado. GC independente GET/POST /api/internal/resumes/gc, deadline45s, lock separado; listVersions/deleteVersion, janela24h, listagem limitada/paginada. Cron jobs06UTC e GC07UTC preparados, **não ativos/verificados remotamente**. DIRECT_DATABASE_URL obrigatória na Vercel para locksession/migrations; TLS remoto verificado e pool2.

Cadastro agora201 público idêntico para email novo/existente, sem alterar conta/role/senha existentes. Auth me erros no-store corrigidos; Profile/Preferences PUT e adminmetrics receberam limite compartilhado. Ownership da sessão e ADMIN como permissão adicional preservados.

Dependências compatíveis atualizadas: lodash4.18.1/fast-uri3.1.8. Audit permanece2altos/1moderado em CLI Prisma (deepmerge-ts/mysql2), ausência no runtime comprovada por manifests/standalone e gate backend:exposure. Nenhum crítico/override/Prisma8. Não afirmar audit limpo.

Gates/testes/medição e blockers operacionais no relatório. Próximo trabalho somente mediante escopo do usuário; não presumir deploy ativo, scheduler ativo ou aprovação para frontend/LLM. Configurar envs/DB/TLS/backup/policy e verificar deployment real antes de abrir público. Alterações prévias das fases1–6 permanecem no working tree, sem commit automático.
