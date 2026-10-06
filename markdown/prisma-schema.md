# Prisma Schema — JobCopilot MVP

> **Projeto:** JobCopilot
> **Versão:** 1.0
> **Status:** Proposta para implementação
> **Objetivo:** Transformar o modelo de domínio aprovado em um schema PostgreSQL/Prisma mínimo para o MVP.

---

# 1. Entidades

O banco terá inicialmente:

```text
User
Session
Resume
Profile
Preference
JobSource
Job
JobEnrichment
JobMatch
MatchFeedback
```

---

# 2. Enums

## UserRole

Não há necessidade de múltiplos papéis no MVP.

Portanto, **não teremos `Role` inicialmente**.

Todo usuário autenticado terá o mesmo nível de acesso.

Isso reduz superfície de autorização e complexidade.

---

## ResumeStatus

```prisma
enum ResumeStatus {
  PENDING
  PROCESSING
  PROCESSED
  FAILED
}
```

---

## JobEnrichmentStatus

```prisma
enum JobEnrichmentStatus {
  PENDING
  PROCESSING
  PROCESSED
  FAILED
}
```

---

## FeedbackType

```prisma
enum FeedbackType {
  RELEVANT
  NOT_RELEVANT
}
```

---

## WorkModel

```prisma
enum WorkModel {
  REMOTE
  HYBRID
  ONSITE
}
```

---

# 3. User

Representa a conta do usuário.

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sessions     Session[]
  resumes      Resume[]
  profile      Profile?
  preference   Preference?
  jobMatches   JobMatch[]
}
```

### Decisões

`email`:

```prisma
@unique
```

A senha será armazenada somente como hash.

O perfil e as preferências serão relacionamentos `1:1`.

---

# 4. Session

Representa a sessão autenticada do usuário.

```prisma
model Session {
  id        String   @id @default(uuid())
  userId    String

  expiresAt DateTime
  createdAt DateTime @default(now())

  user      User     @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  @@index([userId])
  @@index([expiresAt])
}
```

### Decisão

Quando um usuário for excluído:

```text
User
 ↓
Session
```

as sessões deverão ser removidas automaticamente.

---

# 5. Resume

Representa o currículo enviado pelo usuário.

```prisma
model Resume {
  id           String       @id @default(uuid())
  userId       String

  fileName     String
  storageKey   String       @unique
  mimeType     String
  fileSize     Int

  status       ResumeStatus @default(PENDING)

  extractedData Json?

  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  user         User         @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  @@index([userId])
  @@index([userId, status])
}
```

### `extractedData`

Esse campo representa o resultado bruto/estruturado da extração realizada pela IA.

Exemplo:

```json
{
  "skills": [
    "React",
    "TypeScript",
    "Next.js"
  ],
  "experience": [],
  "education": [],
  "languages": []
}
```

Esse campo **não representa necessariamente o perfil confirmado pelo usuário**.

---

# 6. Profile

Representa o perfil profissional final.

```prisma
model Profile {
  id          String   @id @default(uuid())
  userId      String   @unique

  headline    String?
  summary     String?

  skills      Json?
  experiences Json?
  education   Json?
  languages   Json?
  roles       Json?

  seniority   String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )
}
```

### Por que `Json`?

Estruturas como experiência profissional possuem natureza variável.

Exemplo:

```json
[
  {
    "company": "Empresa X",
    "role": "Frontend Developer",
    "startDate": "2023-01",
    "endDate": null,
    "description": "..."
  }
]
```

Para o MVP, normalizar isso em várias tabelas aumentaria significativamente a complexidade sem necessidade.

O formato deve ser validado por Zod na aplicação.

---

# 7. Preference

Representa aquilo que o usuário procura.

```prisma
model Preference {
  id             String      @id @default(uuid())
  userId         String      @unique

  desiredRoles   Json?
  desiredSkills  Json?
  seniority      String?
  workModels     WorkModel[]
  locations      Json?

  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  user           User        @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )
}
```

### Exemplo conceitual

```json
{
  "desiredRoles": [
    "Frontend Developer",
    "Frontend Engineer"
  ],
  "desiredSkills": [
    "React",
    "TypeScript"
  ],
  "seniority": "MID",
  "workModels": [
    "REMOTE"
  ],
  "locations": [
    "Brazil"
  ]
}
```

---

# 8. JobSource

Representa uma fonte de vagas conhecida pelo sistema.

```prisma
model JobSource {
  id        String   @id @default(uuid())
  name      String   @unique
  baseUrl   String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  jobs      Job[]
}
```

### Importante

`JobSource` é uma configuração interna.

O usuário não pode cadastrar qualquer URL e transformar o sistema em um cliente HTTP arbitrário.

---

# 9. Job

Representa uma vaga normalizada.

```prisma
model Job {
  id          String    @id @default(uuid())
  sourceId    String

  externalId  String?
  url         String

  title       String
  company     String
  description String

  location    String?
  workModel   WorkModel?

  publishedAt DateTime?
  collectedAt DateTime  @default(now())

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  source      JobSource       @relation(
    fields: [sourceId],
    references: [id],
    onDelete: Cascade
  )

  enrichment  JobEnrichment?
  matches     JobMatch[]

  @@unique([sourceId, externalId])
  @@index([sourceId])
  @@index([publishedAt])
  @@index([collectedAt])
}
```

---

# 10. Observação sobre `externalId`

Algumas fontes fornecerão um identificador externo:

```text
sourceId + externalId
```

Esse par será utilizado para deduplicação.

Porém, como `externalId` pode ser ausente, a aplicação deverá tratar fontes sem identificador externo separadamente.

Nesses casos, utilizaremos uma estratégia baseada na URL normalizada.

---

# 11. JobEnrichment

Representa o resultado estruturado do processamento da vaga.

```prisma
model JobEnrichment {
  id             String              @id @default(uuid())
  jobId          String              @unique

  status         JobEnrichmentStatus  @default(PENDING)

  technologies   Json?
  requirements   Json?
  niceToHave     Json?
  responsibilities Json?

  seniority      String?
  workModel      WorkModel?

  provider       String?
  model          String?

  processedAt    DateTime?

  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  job            Job                 @relation(
    fields: [jobId],
    references: [id],
    onDelete: Cascade
  )
}
```

### Exemplo

```json
{
  "technologies": [
    "React",
    "TypeScript",
    "Next.js"
  ],
  "requirements": [
    "Experiência com React"
  ],
  "niceToHave": [
    "AWS"
  ],
  "responsibilities": [
    "Desenvolver aplicações web"
  ],
  "seniority": "MID",
  "workModel": "REMOTE"
}
```

---

# 12. Por que guardar `provider` e `model`?

Mesmo utilizando inicialmente uma solução gratuita, queremos saber como aquela informação foi produzida.

Exemplo:

```text
provider = ollama
model    = llama3.x
```

ou outro provider/modelo que adotarmos.

Isso será útil para comparar resultados posteriormente.

Esses campos são metadados, não credenciais.

---

# 13. JobMatch

Representa o resultado do matching entre usuário e vaga.

```prisma
model JobMatch {
  id               String   @id @default(uuid())

  userId           String
  jobId            String

  score            Float

  matchedCriteria  Json?
  missingCriteria  Json?

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user             User     @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  job              Job      @relation(
    fields: [jobId],
    references: [id],
    onDelete: Cascade
  )

  feedback         MatchFeedback?

  @@unique([userId, jobId])
  @@index([userId, score])
  @@index([jobId])
}
```

---

# 14. `score`

O score será calculado pela aplicação.

Exemplo:

```text
0.00 → 100.00
```

ou:

```text
0.0 → 1.0
```

A representação final deverá ser definida no Matching Engine.

A recomendação é armazenar:

```text
0–100
```

pois é mais simples de trabalhar e apresentar.

---

# 15. MatchFeedback

Representa a avaliação do usuário sobre uma recomendação.

```prisma
model MatchFeedback {
  id         String       @id @default(uuid())
  jobMatchId String       @unique
  userId     String

  type       FeedbackType

  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  jobMatch   JobMatch     @relation(
    fields: [jobMatchId],
    references: [id],
    onDelete: Cascade
  )

  user       User         @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  @@index([userId])
}
```

---

# 16. Por que `userId` também está em MatchFeedback?

Mesmo sendo possível obter o usuário através de:

```text
MatchFeedback
   ↓
JobMatch
   ↓
User
```

manter `userId` diretamente permite:

* consultas mais simples;
* índices diretos;
* validações de autorização mais explícitas.

Porém, isso cria uma obrigação:

> A aplicação deve garantir que `MatchFeedback.userId` seja o mesmo proprietário do `JobMatch`.

O `userId` nunca deve ser confiado ao cliente.

---

# 17. Relacionamentos completos

```text
User
 │
 ├── 1:N ── Session
 │
 ├── 1:N ── Resume
 │
 ├── 1:1 ── Profile
 │
 ├── 1:1 ── Preference
 │
 └── 1:N ── JobMatch
                   │
                   ├── N:1 ── Job
                   │              │
                   │              ├── N:1 ── JobSource
                   │              │
                   │              └── 1:1 ── JobEnrichment
                   │
                   └── 1:1 ── MatchFeedback
```

---

# 18. Cascades

Os relacionamentos privados utilizarão `onDelete: Cascade` onde fizer sentido.

Por exemplo:

```text
User
 ↓
Resume
 ↓
delete
```

e:

```text
User
 ↓
JobMatch
 ↓
delete
```

Isso evita registros órfãos.

A exclusão de uma `JobSource`, entretanto, deve ser tratada com cuidado, pois implica potencialmente a exclusão de todas as vagas daquela fonte.

Por isso, a política definitiva para `JobSource` deverá considerar se fontes serão apenas desativadas em vez de apagadas.

---

# 19. Índices essenciais

O MVP terá índices principalmente para consultas recorrentes.

### User

```prisma
@unique([email])
```

### Session

```prisma
@@index([userId])
@@index([expiresAt])
```

### Resume

```prisma
@@index([userId])
@@index([userId, status])
```

### Job

```prisma
@@index([sourceId])
@@index([publishedAt])
@@index([collectedAt])
```

### JobMatch

```prisma
@@index([userId, score])
@@index([jobId])
```

### MatchFeedback

```prisma
@@index([userId])
```

---

# 20. O que deliberadamente NÃO está no schema

Não teremos inicialmente:

```text
Company
Skill
Technology
Location
Notification
Application
Subscription
Payment
ResumeVersion
MatchAlgorithmVersion
JobSourceConfiguration
AuditLog
```

Essas entidades poderão surgir quando houver necessidade real.

---

# 21. Decisão sobre Notification

Não teremos uma tabela `Notification` no MVP.

A notificação em tempo real será um evento transitório:

```text
JobMatch criado
       ↓
Realtime
       ↓
Usuário
```

O estado persistente continuará sendo:

```text
JobMatch
```

Caso futuramente precisemos de:

* notificações não lidas;
* histórico;
* push;
* email;
* central de notificações;

poderemos introduzir:

```text
Notification
```

---

# 22. Decisão sobre Company

Não teremos uma tabela `Company`.

No MVP:

```text
Job.company
```

será suficiente.

Se posteriormente precisarmos de:

```text
Company
 ├── vacancies
 ├── logo
 ├── website
 ├── metadata
 └── analytics
```

essa entidade poderá ser extraída.

---

# 23. Decisão sobre Skill e Technology

Também não teremos entidades específicas.

Usaremos estruturas simples:

```json
[
  "React",
  "TypeScript",
  "Next.js"
]
```

O problema de aliases e taxonomia será resolvido posteriormente, caso a validação demonstre necessidade.

---

# 24. Decisão sobre versionamento

Não teremos inicialmente:

```text
ResumeVersion
JobEnrichmentVersion
MatchingAlgorithmVersion
```

Porém, `JobEnrichment` possui:

```text
provider
model
createdAt
updatedAt
```

suficientes para rastrear minimamente qual mecanismo produziu o enriquecimento atual.

Versionamento completo será uma evolução futura.

---

# 25. Schema completo proposto

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ResumeStatus {
  PENDING
  PROCESSING
  PROCESSED
  FAILED
}

enum JobEnrichmentStatus {
  PENDING
  PROCESSING
  PROCESSED
  FAILED
}

enum FeedbackType {
  RELEVANT
  NOT_RELEVANT
}

enum WorkModel {
  REMOTE
  HYBRID
  ONSITE
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sessions     Session[]
  resumes      Resume[]
  profile      Profile?
  preference   Preference?
  jobMatches   JobMatch[]
  feedbacks    MatchFeedback[]
}

model Session {
  id        String   @id @default(uuid())
  userId    String

  expiresAt DateTime
  createdAt DateTime @default(now())

  user      User     @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  @@index([userId])
  @@index([expiresAt])
}

model Resume {
  id            String       @id @default(uuid())
  userId        String

  fileName      String
  storageKey    String       @unique
  mimeType      String
  fileSize      Int

  status        ResumeStatus @default(PENDING)

  extractedData Json?

  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  user          User         @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  @@index([userId])
  @@index([userId, status])
}

model Profile {
  id          String   @id @default(uuid())
  userId      String   @unique

  headline    String?
  summary     String?

  skills      Json?
  experiences Json?
  education   Json?
  languages   Json?
  roles       Json?

  seniority   String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )
}

model Preference {
  id            String      @id @default(uuid())
  userId        String      @unique

  desiredRoles  Json?
  desiredSkills Json?
  seniority     String?
  workModels    WorkModel[]
  locations     Json?

  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  user          User        @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )
}

model JobSource {
  id        String   @id @default(uuid())
  name      String   @unique
  baseUrl   String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  jobs      Job[]
}

model Job {
  id           String     @id @default(uuid())
  sourceId     String

  externalId   String?
  url          String

  title        String
  company      String
  description  String

  location     String?
  workModel    WorkModel?

  publishedAt  DateTime?
  collectedAt  DateTime   @default(now())

  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  source       JobSource      @relation(
    fields: [sourceId],
    references: [id],
    onDelete: Cascade
  )

  enrichment   JobEnrichment?
  matches      JobMatch[]

  @@unique([sourceId, externalId])
  @@index([sourceId])
  @@index([publishedAt])
  @@index([collectedAt])
}

model JobEnrichment {
  id                String             @id @default(uuid())
  jobId             String             @unique

  status            JobEnrichmentStatus @default(PENDING)

  technologies      Json?
  requirements      Json?
  niceToHave        Json?
  responsibilities Json?

  seniority         String?
  workModel         WorkModel?

  provider          String?
  model             String?

  processedAt       DateTime?

  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  job               Job                @relation(
    fields: [jobId],
    references: [id],
    onDelete: Cascade
  )
}

model JobMatch {
  id              String   @id @default(uuid())
  userId          String
  jobId           String

  score            Float

  matchedCriteria Json?
  missingCriteria Json?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user            User     @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  job             Job      @relation(
    fields: [jobId],
    references: [id],
    onDelete: Cascade
  )

  feedback        MatchFeedback?

  @@unique([userId, jobId])
  @@index([userId, score])
  @@index([jobId])
}

model MatchFeedback {
  id         String       @id @default(uuid())
  jobMatchId String       @unique
  userId     String

  type       FeedbackType

  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  jobMatch   JobMatch     @relation(
    fields: [jobMatchId],
    references: [id],
    onDelete: Cascade
  )

  user       User         @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  @@index([userId])
}
```

---

# 26. Ponto a revisar antes da migration

Existe uma particularidade no trecho:

```prisma
@@unique([sourceId, externalId])
```

com `externalId` opcional.

No PostgreSQL, valores `NULL` não são tratados como iguais para uma constraint `UNIQUE`, portanto vagas com `externalId = NULL` podem coexistir.

Isso é aceitável porque teremos uma estratégia de deduplicação por URL para fontes que não forneçam identificador externo.

A implementação da deduplicação não deve depender exclusivamente dessa constraint.

---

# 27. Decisão final

Este schema representa o **mínimo persistente necessário para o MVP**.

Ele suporta:

```text
Autenticação
     ↓
Currículo
     ↓
Perfil
     ↓
Preferências
     ↓
Coleta de vagas
     ↓
Enriquecimento
     ↓
Matching
     ↓
Recomendações
     ↓
Feedback
```

Sem antecipar:

```text
Microservices
CQRS
Event sourcing
Taxonomia complexa
Notification system
Company system
ML platform
```

A próxima alteração significativa no schema deverá ser motivada por uma necessidade concreta identificada durante implementação ou validação.
