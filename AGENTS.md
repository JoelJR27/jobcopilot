# AGENTS.md — JobCopilot

## Purpose

This file contains the architectural and implementation rules that Codex must follow when working on **JobCopilot**.

Treat the rules marked as **fixed** or **non-negotiable** as project decisions. Do not silently replace them with a different architecture, library, convention, or folder structure. If a change appears necessary, explain the reason and ask for explicit approval before changing the decision.

The current goal is to validate the MVP with the **smallest reasonable amount of complexity and zero infrastructure/service cost**.

---

## Product

JobCopilot is an AI-assisted job monitoring and recommendation product for job seekers.

The MVP exists to validate one central hypothesis:

> Users find the jobs automatically discovered and recommended by JobCopilot materially relevant.

### MVP scope

The MVP includes:

- User registration, login, logout, and session persistence.
- One active résumé per user.
- Résumé upload in PDF and DOCX.
- Structured information extraction from the résumé.
- User review/edit of the extracted profile.
- Basic job preferences.
- Automatic job collection, initially once per day.
- LLM-based job enrichment.
- Job matching.
- Recommended-jobs list with match score/reasons.
- Relevant / not relevant feedback.
- In-app indication/notification when newly processed jobs match a user.

The MVP does **not** include:

- Automatic job applications.
- Résumé generation.
- Interview simulation.
- Chatbot.
- Browser extension.
- Mobile app.

---

## Non-negotiable MVP constraints

### Zero-cost validation

During MVP validation:

- Prefer free, open-source, self-hosted, or free-tier services.
- Do not introduce a paid dependency unless the user explicitly approves it.
- LLM usage must also respect the free/zero-cost constraint.

### Keep the MVP lean

Do not introduce infrastructure only because it may be useful at scale.

Avoid premature:

- microservices;
- dedicated worker services;
- queues;
- distributed event buses;
- complex CQRS;
- extra repositories/services with no current use;
- unnecessary domain entities.

A future migration to a dedicated NestJS backend, workers, queues, etc. is possible, but it is **not the current architecture**.

---

## Current technical stack

Use the versions/conventions already chosen by the project.

- Next.js 16
- TypeScript
- pnpm
- Node.js 24.x
- Prisma 7.x
- PostgreSQL
- Docker for local PostgreSQL
- Zod v4
- bcrypt
- Vitest
- Backblaze B2 using its S3-compatible API
- AWS SDK `@aws-sdk/client-s3`

Important:

- Do **not** migrate the project to Prisma 8.
- Prefer `pnpm prisma` / `pnpm exec prisma`.
- The project currently has **no `src/` directory**. Do not introduce one merely for convention.

---

## Current project structure

The intended structure is:

```text
jobcopilot/
├── app/
│   └── api/
├── features/
├── application/
├── domain/
├── infrastructure/
├── shared/
├── prisma/
├── tests/
├── public/
├── proxy.ts
├── docker-compose.yml
├── prisma.config.ts
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

The actual repository may not yet contain every folder above.

Do not move existing working code merely to make the tree look more symmetrical.

---

## Architecture rules

### Dependency direction

The dependency direction is:

```text
HTTP / Next.js / Infrastructure
            ↓
       Application
            ↓
          Domain
```

Application code must not depend directly on concrete infrastructure implementations.

Use ports/interfaces where an application use case needs an external dependency.

Infrastructure implements those ports.

### Composition

Concrete dependencies are wired in `infrastructure/composition/**`.

Example:

```text
UploadResume
    ↓
ResumeRepository / ResumeStorage
    ↓
PrismaResumeRepository / B2ResumeStorage
```

Do not instantiate `PrismaResumeRepository`, `B2ResumeStorage`, or similar concrete infrastructure classes inside application use cases.

### HTTP layer

Next.js Route Handlers under `app/api/**/route.ts` are the HTTP adapter.

Route handlers should remain thin:

1. authenticate;
2. parse HTTP input;
3. perform cheap adapter-level checks where useful;
4. call an application use case;
5. translate application errors into HTTP responses;
6. avoid leaking infrastructure internals.

Do not place business rules in Route Handlers.

### Server Components / Server Actions

Server Components may call application use cases directly when appropriate.

Server Actions are acceptable for internal application mutations when appropriate.

Explicit HTTP APIs belong in Route Handlers.

---

## Error conventions

Application/domain errors live under `shared/errors/`.

Known errors include:

- `ApplicationError`
- `ConflictError`
- `AuthenticationError`
- `UnauthorizedError`
- `ValidationError`

Do not expose raw infrastructure errors or stack traces to the client.

Unexpected failures should be logged server-side and converted to controlled generic responses.

Avoid logging secrets and sensitive résumé/profile content.

---

## Zod convention

The project uses **Zod v4**.

All controllable validation messages should use Zod v4's `error` option, in Brazilian Portuguese.

Correct:

```ts
z.string({
    error: 'Campo obrigatório.',
});
```

Correct:

```ts
z.url({
    error: 'URL inválida.',
});
```

Do not revert to the older `message` convention unless required by an API that is not Zod v4.

---

## Authentication

Authentication is session-based.

### Current rules

- Passwords use bcrypt.
- Sessions are stored in the database.
- Session duration is currently 7 days.
- Multiple simultaneous device sessions are supported.
- Cookies are:
  - HttpOnly;
  - Secure in production;
  - SameSite=Lax;
  - scoped to `/`.
- Authentication-sensitive routes derive `userId` from the authenticated session.
- Never trust a client-supplied `userId`.

### Existing components

Application ports include:

```text
application/auth/ports/password-hasher.ts
application/auth/ports/user-repository.ts
application/auth/ports/session-repository.ts
application/auth/ports/session-manager.ts
```

Infrastructure includes, among others:

```text
infrastructure/auth/password/bcrypt-password-hasher.ts
infrastructure/auth/session/prisma-session-manager.ts
infrastructure/auth/session/session-cookie.ts
infrastructure/auth/session/require-authenticated-user.ts
infrastructure/composition/auth.ts
```

`requireAuthenticatedUser()` currently obtains the session cookie and resolves the authenticated user using the auth composition factory.

---

## Résumé domain decisions

### One résumé per user

A user has exactly **one current résumé**.

`Resume.userId` is unique.

Do not change this back to a one-to-many model without explicit approval.

### Supported formats

Only:

- PDF
- DOCX

TXT is not a supported résumé format.

### Upload security

The résumé upload flow must enforce:

- maximum size: 5 MB;
- allowed MIME types;
- server-side file signature checks;
- random server-generated storage keys;
- private storage;
- no executable behavior.

Do not trust:

- filename;
- extension;
- MIME type alone;
- client-provided user identity.

### Storage key

Current storage-key format:

```text
resumes/{userId}/{uuid}.pdf
resumes/{userId}/{uuid}.docx
```

The extension is derived from the validated MIME type, not from the original filename.

### Current validation behavior

`application/resume/validate-resume-file.ts` currently validates:

- max 5 MB;
- MIME is PDF or DOCX;
- PDF starts with `%PDF-`;
- DOCX starts with ZIP signature `PK\x03\x04`.

Important: the ZIP signature only proves that the file is ZIP-like. It does **not** yet prove it is a structurally valid DOCX. This is known hardening work, not a reason to block the current endpoint.

---

## Résumé storage

Backblaze B2 is the current object storage provider.

Cloudflare R2 was intentionally not used because the MVP must avoid card/payment requirements.

The B2 bucket is private.

Use the S3-compatible API through `@aws-sdk/client-s3`.

### Ports

Normal storage operations:

```text
application/resume/ports/resume-storage.ts
```

with:

- `save`
- `get`
- `delete`

Maintenance-only operations:

```text
application/resume/ports/resume-storage-maintenance.ts
```

with:

- `listVersions`
- `deleteVersion`

Do not merge the maintenance methods back into the normal `ResumeStorage` port. The separation is intentional and follows interface-segregation concerns.

### B2 versioning semantics

`delete(key)` may create a hidden/delete-marker version.

`deleteVersion(key, versionId)` removes a specific version.

Garbage collection must use version-aware deletion.

---

## Résumé repositories

Normal application repository:

```text
application/resume/ports/resume-repository.ts
```

Current methods:

- `findByUserId`
- `create`
- `update`

Maintenance repository:

```text
application/resume/ports/resume-maintenance-repository.ts
```

Current method:

- `listStorageKeys`

Do not merge maintenance operations into the normal repository merely for convenience.

---

## Current `UploadResume` behavior

`application/resume/upload-resume.ts` currently does:

1. validate the file;
2. load the user's current résumé;
3. derive `.pdf` or `.docx` from validated MIME;
4. generate `resumes/{userId}/{uuid}.{extension}`;
5. upload the new file to B2;
6. create/update the database row;
7. if DB persistence fails, delete the newly uploaded B2 object as compensation;
8. after a successful update, try to delete the previous object;
9. if previous-object deletion fails, do not fail the user operation; log it and let garbage collection remove the orphan later.

This compensation behavior is intentional.

---

## Garbage collection

Garbage collection is handled by:

```text
application/resume/cleanup-orphaned-resumes.ts
```

It depends on:

- `ResumeMaintenanceRepository`
- `ResumeStorageMaintenance`

### Current rule

A B2 version may be deleted when:

```text
its storage key is NOT referenced in the database
AND
its lastModified is older than the 24-hour safety window
```

Current valid database keys must never be deleted.

Delete markers can also be removed if they satisfy the orphan + age conditions.

The GC must not run as part of `UploadResume`.

It will later be invoked by infrastructure/scheduling.

Do not implement a `setInterval()` inside the Next.js process as the scheduler.

The eventual scheduling mechanism must respect the zero-cost MVP constraint.

---

## Prisma / database model decisions

The current conceptual models are:

- User
- Session
- Resume
- Profile
- Preference
- JobSource
- Job
- JobEnrichment
- JobMatch
- MatchFeedback

Do not add entities such as Company, Skill, Technology, Location, Notification, etc. unless the current feature requires them.

Flexible MVP structures may use JSON validated at application boundaries.

### Important constraints

- `Resume.userId` unique.
- `JobSource.active` exists.
- Jobs must not cascade-delete merely because a source is removed.
- Job dedupe uses:
  - `@@unique([sourceId, externalId])`
  - `@@unique([sourceId, normalizedUrl])`
- `Preference.workModels` is JSON because the current Prisma connector setup does not support the desired primitive-list representation.
- `Job.workModel` and `JobEnrichment.workModel` may remain enum values.

Database fields use snake_case mappings as appropriate while TypeScript/domain naming stays camelCase.

---

## Security baseline

Treat all external data as untrusted:

- user input;
- résumé content;
- collected job content;
- LLM output;
- URLs.

Security principles:

- least privilege;
- server-side trust boundary;
- no IDOR/BOLA;
- no client-supplied identity for protected actions;
- private résumé storage;
- random storage keys;
- upload size/type/signature validation;
- no secrets in `NEXT_PUBLIC_*`;
- controlled client errors;
- do not log secrets/PII unnecessarily;
- Prisma parameterized queries;
- avoid unsafe raw SQL;
- protect cookie-authenticated state-changing endpoints against applicable CSRF risks;
- do not fetch arbitrary user-supplied URLs in collectors;
- collectors use preconfigured sources;
- validate LLM structured output with Zod before use;
- LLMs must not be allowed to execute tools/system actions based on résumé/job text;
- rate-limit login, upload, and LLM-expensive operations when those endpoints are exposed.

---

## LLM rules

LLM providers must sit behind an abstraction.

The architecture previously established the idea of an `AIProvider` port so providers can be swapped.

During MVP validation, use only a free/free-tier option compatible with the zero-cost requirement.

Résumé and job text are untrusted prompt content.

The LLM is a structured-data processor, not an autonomous actor.

Validate every structured response before persisting or acting on it.

---

## Testing

Use Vitest.

The test environment is Node.

The project uses `vite-tsconfig-paths` so tests understand `@/*`.

`vitest.config.ts` loads `.env` through `dotenv`.

Current B2 integration tests have already validated:

- save;
- get;
- delete;
- missing key returns null;
- list versions;
- delete a specific version.

`UploadResume` unit tests already cover:

- create when none exists;
- replace current résumé;
- DB failure triggers deletion of the newly uploaded object;
- storage upload failure prevents DB persistence;
- old-object deletion failure does not fail the successful résumé replacement.

`CleanupOrphanedResumes` tests already cover the main orphan/safety-window behavior.

Do not make unit tests depend on real B2/PostgreSQL unless the test is explicitly an integration test.

---

## Code style

Prefer:

- small use cases;
- explicit dependencies;
- clear Portuguese error messages;
- `import type` for type-only imports;
- names that expose responsibility rather than implementation detail.

Do not refactor working code merely to make constructors or files look aesthetically identical.

For example, it is acceptable for one use case to receive positional dependencies and another to receive a dependency object if both APIs are already clear and tested.

---

## Current coding priority

Before adding job collection, LLM enrichment, matching, or scheduler infrastructure, finish the current résumé HTTP flow.

The immediate feature is:

```text
POST /api/resumes
```

Expected behavior:

```text
request
  ↓
authenticated user
  ↓
multipart/form-data
  ↓
file extraction
  ↓
cheap HTTP-level size rejection if useful
  ↓
UploadResume.execute(...)
  ↓
controlled HTTP response
```

Tests should include at least:

- no session → 401;
- no file → 400;
- TXT → 400;
- fake/invalid PDF → 400;
- fake/invalid DOCX → 400;
- >5 MB → 400;
- valid PDF → 201;
- valid DOCX → 201;
- `storageKey` is never exposed in the HTTP response.

Read `docs/CODEX_HANDOFF.md` for the exact current state before editing.
