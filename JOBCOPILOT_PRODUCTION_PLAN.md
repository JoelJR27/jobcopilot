# JobCopilot — Plano de Ação para Produção

## Objetivo

Entregar uma primeira versão pública e utilizável do JobCopilot com foco em qualidade, segurança e velocidade. A aplicação deve funcionar para múltiplos usuários reais e permitir que o proprietário também seja `ADMIN` sem perder o comportamento normal de usuário.

Antes de qualquer alteração, o Codex deve ler:

- `AGENTS.md`
- `docs/CODEX_HANDOFF.md`
- este documento

O Codex deve sempre inspecionar a implementação real antes de alterar interfaces, construtores, schemas ou factories.

---

## 1. Critério de sucesso

A versão inicial estará pronta quando um novo usuário conseguir:

1. registrar conta;
2. fazer login/logout;
3. enviar currículo PDF/DOCX;
4. preencher/corrigir perfil;
5. definir preferências de vagas;
6. receber vagas coletadas;
7. visualizar recomendações ordenadas por compatibilidade;
8. entender `matchedCriteria` e `missingCriteria`;
9. abrir a vaga original;
10. marcar recomendação como relevante/não relevante.

Fluxo:

```text
register/login
  ↓
resume
  ↓
profile
  ↓
preferences
  ↓
job collection
  ↓
dedupe
  ↓
matching
  ↓
/jobs
  ↓
feedback
```

---

## 2. Escopo obrigatório

Incluído nesta primeira produção:

- autenticação por sessão;
- autorização USER/ADMIN;
- seed de administrador;
- isolamento multiusuário;
- currículo único por usuário;
- profile;
- preferences;
- onboarding mínimo;
- uma fonte inicial de vagas;
- normalização e deduplicação;
- matching determinístico v1;
- `/jobs`;
- feedback;
- `/admin` mínimo;
- pipeline executável manualmente;
- scheduler diário;
- deploy;
- migrations;
- smoke tests;
- logs mínimos.

Não bloquear o lançamento por:

- múltiplas fontes;
- Redis/BullMQ;
- microserviços;
- NestJS separado;
- WebSockets;
- app mobile;
- auto-apply;
- geração de currículo;
- chatbot;
- design system completo;
- matching totalmente por LLM.

---

## 3. Multiusuário é requisito de produção

Nenhuma operação autenticada deve confiar em `userId`, `email`, `role`, `resumeId`, `profileId`, `preferenceId` ou `jobMatchId` enviados pelo cliente para determinar propriedade.

A identidade deve vir da sessão:

```ts
const user = await requireAuthenticatedUser();
```

Operações do usuário devem usar `user.id`.

É obrigatório testar acesso cruzado entre usuários.

---

## 4. Roles: USER e ADMIN

Adicionar ao Prisma:

```prisma
enum UserRole {
  USER
  ADMIN
}
```

E no `User`:

```prisma
role UserRole @default(USER)
```

Regra:

```text
ADMIN = USER + permissões administrativas
```

O admin deve continuar usando normalmente:

- resume;
- profile;
- preferences;
- jobs;
- feedback.

Não criar “modo admin” para fluxos comuns.

Criar:

```text
shared/errors/forbidden-error.ts
infrastructure/auth/session/require-admin-user.ts
```

Sem sessão → `401`.

Autenticado sem permissão → `403`.

---

## 5. Seed do administrador

Criar seed idempotente usando:

```env
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
```

Nunca hardcodar credenciais.

Arquivo sugerido:

```text
prisma/seed.ts
```

Regras:

- validar email/senha;
- usar bcrypt;
- `upsert` pelo email;
- se não existir, criar com `role: ADMIN`;
- se já existir, promover para `ADMIN`;
- NÃO substituir senha de usuário existente;
- nunca logar senha;
- manter compatibilidade com Prisma 7.

Produção:

```bash
pnpm prisma migrate deploy
pnpm prisma db seed
```

Ajustar comandos aos scripts reais do projeto.

---

## 6. Fase 1 — roles + seed

Implementar primeiro:

- `UserRole`;
- migration;
- retorno de `role` no usuário autenticado;
- `ForbiddenError`;
- `requireAdminUser`;
- seed;
- `.env.example`;
- testes.

Testes:

```text
USER usa fluxo normal → permitido
ADMIN usa fluxo normal → permitido
USER acessa admin → 403
ADMIN acessa admin → permitido
sem sessão em admin → 401
```

---

## 7. Fase 2 — fechar Resume

A rota `POST /api/resumes` já existe.

Finalizar testes de:

```text
401 sem sessão
403 origem inválida/cross-site
429 rate limit
400 content-type inválido
400 multipart inválido
400 sem arquivo
400 > 5 MB
400 TXT
400 PDF inválido
400 DOCX inválido
201 PDF
201 DOCX
storageKey nunca exposto
```

Manter:

- B2 privado;
- MIME;
- assinatura;
- 5 MB;
- storage key randômica;
- `userId` da sessão.

Se o rate limiter atual for em memória, documentar como proteção provisória. Não tratá-lo como distribuído.

---

## 8. Fase 3 — Profile

Criar casos de uso:

```text
application/profile/get-profile.ts
application/profile/upsert-profile.ts
```

HTTP:

```text
GET /api/profile
PUT /api/profile
```

Campos mínimos:

- headline;
- summary;
- skills;
- experiences;
- education;
- languages;
- roles;
- seniority.

UI:

```text
/profile
```

Regras:

- autenticado;
- `userId` da sessão;
- Zod v4;
- mensagens PT-BR;
- não criar novas entidades sem necessidade;
- teste de isolamento entre usuários.

A extração automática do currículo não deve bloquear o lançamento. Perfil manual é aceitável na primeira versão.

---

## 9. Fase 4 — Preferences

HTTP:

```text
GET /api/preferences
PUT /api/preferences
```

Campos mínimos:

- desiredRoles;
- desiredSkills;
- seniority;
- workModels;
- locations.

UI:

```text
/preferences
```

Mesmas regras de ownership, autenticação e Zod v4.

---

## 10. Fase 5 — onboarding mínimo

Criar:

```text
/onboarding
```

Mostrar progresso:

```text
[✓] conta
[ ] currículo
[ ] perfil
[ ] preferências
```

Após completar, direcionar para `/jobs`.

Não criar wizard complexo.

---

## 11. Fase 6 — primeiro JobCollector

Implementar apenas UMA fonte inicialmente.

Fluxo:

```text
JobSource
  ↓
collector
  ↓
normalize
  ↓
dedupe
  ↓
Job
```

Campos mínimos:

- externalId opcional;
- url;
- normalizedUrl;
- title;
- company;
- description;
- location;
- workModel;
- publishedAt.

Deduplicação:

```text
externalId disponível → sourceId + externalId
senão                 → sourceId + normalizedUrl
```

Usar constraints do banco como última defesa.

Não adicionar Redis, BullMQ ou scraping genérico.

---

## 12. Fase 7 — enrichment

Enrichment pode existir, mas não deve bloquear vagas utilizáveis.

Campos:

- technologies;
- requirements;
- niceToHave;
- responsibilities;
- seniority;
- workModel.

Se usar LLM:

- provider atrás de port;
- zero-cost/free-tier;
- output estruturado;
- Zod;
- job description é input não confiável;
- sem execução de tools/comandos;
- fallback quando o provider falhar.

---

## 13. Fase 8 — matching v1

Implementar matching determinístico, explicável e testável.

Pesos iniciais sugeridos:

```text
cargo            30
skills           35
senioridade      15
work model       10
localização      10
```

Persistir:

```text
score
matchedCriteria
missingCriteria
```

Score = compatibilidade, não probabilidade de contratação.

Testar:

- forte;
- parcial;
- fraco;
- senioridade incompatível;
- work model incompatível;
- localização incompatível;
- upsert por `userId + jobId`;
- usuários diferentes com matches independentes.

---

## 14. Fase 9 — pipeline multiusuário

Criar um orquestrador fino, por exemplo:

```text
RunDailyJobPipeline
```

Responsabilidades:

```text
collect
  ↓
persist/dedupe
  ↓
enrich quando disponível
  ↓
listar usuários elegíveis
  ↓
match
```

Usuário elegível: possui Profile + Preference suficientes.

Criar comando manual, por exemplo:

```bash
pnpm jobs:run
```

Primeiro garantir execução manual confiável. Depois automatizar.

---

## 15. Fase 10 — `/jobs`

Esta é a tela principal do produto.

Mostrar apenas `JobMatch` do usuário autenticado.

Ordenar:

```text
score DESC
publishedAt DESC
```

Cada card:

- score;
- title;
- company;
- location;
- workModel;
- publishedAt;
- matchedCriteria;
- missingCriteria;
- botão para vaga original.

Estados:

- loading;
- erro;
- vazio;
- perfil/preferências incompletos.

Adicionar paginação se necessário.

---

## 16. Fase 11 — feedback

Usar `MatchFeedback` existente.

Endpoint sugerido:

```text
PUT /api/job-matches/:id/feedback
```

Tipos:

```text
RELEVANT
NOT_RELEVANT
```

Antes de alterar feedback:

```text
JobMatch.userId === authenticatedUser.id
```

Adicionar botões em `/jobs`.

Não adaptar automaticamente o matching ainda.

---

## 17. Fase 12 — `/admin` mínimo

Protegido por `requireAdminUser`.

Mostrar:

- total de usuários;
- total de resumes;
- total de jobs;
- total de matches;
- JobSources;
- status das fontes;
- última execução do pipeline, se disponível.

Ações opcionais:

- ativar/desativar fonte;
- disparar pipeline manualmente.

Não implementar impersonation.

Não mostrar currículos privados ou dados pessoais desnecessários.

O admin deve continuar usando `/jobs`, `/profile` e `/preferences` normalmente.

---

## 18. Fase 13 — scheduler e GC

Não usar `setInterval()` dentro do Next.js.

O scheduler deve apenas disparar adapters/casos de uso.

Automatizar diariamente:

- `RunDailyJobPipeline`;
- `CleanupOrphanedResumes`.

Falha de GC não deve impedir coleta/matching.

Endpoint interno, se necessário, deve ser protegido por segredo server-only ou mecanismo próprio da plataforma.

---

## 19. Fase 14 — segurança para usuários externos

Antes de convidar terceiros, garantir:

- rate limit de login;
- rate limit de registro;
- rate limit de upload;
- limites de payload;
- validação de inputs;
- cookies seguros;
- CSRF/origin quando aplicável;
- B2 privado;
- ownership checks;
- nenhuma rota admin aberta;
- nenhum secret em `NEXT_PUBLIC_*`;
- nenhum stack trace para cliente;
- paginação de listas grandes.

Testes multiusuário obrigatórios:

```text
A não acessa resume de B
A não edita profile de B
A não edita preferences de B
A não vê JobMatch de B
A não envia feedback em JobMatch de B
USER não acessa admin
ADMIN usa fluxos comuns normalmente
```

---

## 20. Fase 15 — UX mínima

Páginas mínimas:

```text
/
login
register
onboarding
profile
preferences
jobs
account
admin
```

Mensagem em `/jobs`:

```text
A pontuação indica compatibilidade com seu perfil e preferências.
Ela não representa probabilidade de contratação.
```

Não gastar tempo agora em landing page sofisticada ou animações.

---

## 21. Fase 16 — observabilidade

Logar:

- início/fim do pipeline;
- vagas coletadas;
- inseridas;
- duplicadas;
- falhas de collector;
- usuários processados;
- matches gerados;
- falhas de enrichment;
- falhas de scheduler.

Não logar:

- senha;
- session id;
- secrets;
- currículo completo;
- dados pessoais sem necessidade.

---

## 22. Fase 17 — deploy

Antes de subir:

```bash
pnpm lint
pnpm test
pnpm build
```

Produção:

```bash
pnpm prisma migrate deploy
pnpm prisma db seed
```

Revisar env vars:

```text
DATABASE_URL
B2_ENDPOINT
B2_REGION
B2_KEY_ID
B2_KEY_NAME
B2_APPLICATION_KEY
B2_BUCKET_NAME
SEED_ADMIN_EMAIL
SEED_ADMIN_PASSWORD
APP_URL
```

mais variáveis realmente usadas pelo collector/LLM/scheduler.

Regras:

- `.env` fora do Git;
- `.env.example` sem secrets;
- nada secreto em `NEXT_PUBLIC_*`;
- envs exclusivas do seed não devem impedir runtime normal.

---

## 23. Smoke test de produção

Criar duas contas:

```text
Admin A
User B
```

Testar Admin A:

- login;
- resume;
- profile;
- preferences;
- jobs;
- feedback;
- `/admin`.

Testar User B:

- registro;
- login;
- resume;
- profile;
- preferences;
- jobs;
- feedback;
- `/admin` → 403.

Confirmar isolamento:

```text
Admin A não vê dados privados de User B no fluxo comum
User B não vê dados de Admin A
```

---

## 24. Ordem exata recomendada

```text
1. roles + migration
2. seed admin
3. testes USER/ADMIN
4. fechar testes de Resume
5. Profile
6. Preferences
7. onboarding
8. JobCollector
9. persistência/deduplicação
10. matching
11. pipeline multiusuário
12. /jobs
13. feedback
14. /admin
15. scheduler
16. GC integrado ao scheduler
17. testes de segurança multiusuário
18. lint/test/build
19. migrate deploy + seed
20. deploy
21. smoke test
```

---

## 25. Critérios que bloqueiam deploy

Não publicar se houver:

```text
acesso cross-user
currículo público
secret exposto no frontend
senha sem hash
role controlável pelo cliente
admin sem autorização
migrations quebradas
build quebrado
duplicação descontrolada de jobs
JobMatch sem filtro por userId
feedback cross-user
```

---

## 26. Débitos aceitáveis

Não bloqueiam a primeira produção:

```text
uma fonte de vagas
matching determinístico
profile manual
sem realtime
sem websocket
sem mobile
sem aprendizado por feedback
sem múltiplos providers
GC simples
rate limit local documentado, se demais proteções estiverem presentes
```

---

## 27. Template de prompt para o Codex

Usar uma fase por vez:

```text
Leia AGENTS.md, docs/CODEX_HANDOFF.md e JOBCOPILOT_PRODUCTION_PLAN.md.

Inspecione a implementação real antes de modificar qualquer arquivo.

Implemente somente:
[FASE]

Requisitos:
- preserve a arquitetura atual;
- use Prisma 7;
- não introduza src/;
- não faça refatorações fora do escopo;
- preserve isolamento multiusuário;
- userId deve vir da sessão;
- use Zod v4 com `error` e mensagens PT-BR;
- não introduza infraestrutura paga;
- rode os testes relacionados;
- rode lint/typecheck quando aplicável.

Ao finalizar:
1. liste arquivos alterados;
2. explique decisões;
3. mostre testes executados e resultados;
4. liste débitos técnicos;
5. NÃO inicie a próxima fase.
```

---

## 28. Prompt inicial recomendado ao Codex

```text
Leia AGENTS.md, docs/CODEX_HANDOFF.md e JOBCOPILOT_PRODUCTION_PLAN.md.

Comece pela Fase 1: roles USER/ADMIN e migration.

Requisitos:
- enum UserRole com USER e ADMIN;
- USER default;
- ADMIN mantém todos os fluxos normais de USER;
- role é permissão adicional, não experiência separada;
- implemente ForbiddenError;
- implemente requireAdminUser;
- atualize autenticação/repositórios apenas onde necessário;
- crie migration compatível com Prisma 7;
- adicione testes de USER vs ADMIN;
- não implemente ainda /admin.

Depois pare e apresente:
- arquivos alterados;
- migration;
- testes executados;
- resultado;
- débitos encontrados.
```

---

## 29. Critério final de produto

A versão está pronta quando:

```text
novo usuário
  ↓
cria conta
  ↓
envia currículo
  ↓
completa perfil
  ↓
define preferências
  ↓
recebe vagas reais
  ↓
vê ranking próprio
  ↓
abre vaga
  ↓
envia feedback
```

e:

```text
ADMIN
  ├── usa exatamente esse mesmo fluxo
  └── possui ferramentas administrativas adicionais
```

A prioridade é colocar o JobCopilot em uso real o mais rápido possível sem sacrificar segurança, isolamento de dados, testabilidade ou a arquitetura já definida.
