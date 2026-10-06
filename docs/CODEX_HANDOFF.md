# JobCopilot — Codex Handoff

**Last updated:** 2026-10-05

This file is a continuation handoff from the ChatGPT development session for JobCopilot.

Before changing code:

1. Read `/AGENTS.md`.
2. Inspect the actual repository and confirm file names/signatures.
3. Prefer the repository's existing implementation over assumptions in this document if small syntactic differences exist.
4. Do not change fixed architectural decisions without explicit user approval.

---

## Where development stopped

The résumé application/storage flow is largely implemented and tested.

The immediate next task is to implement and test:

```text
POST /api/resumes
```

The intended route path is:

```text
app/api/resumes/route.ts
```

The endpoint must connect the existing authentication helper to the existing `UploadResume` use case.

After that, proceed to Route Handler tests.

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
