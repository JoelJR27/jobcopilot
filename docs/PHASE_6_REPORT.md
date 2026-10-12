# Fase 6 — Swile/Lever, feedback, admin e preparação Vercel

Data: 2026-10-07. Os onze documentos solicitados foram lidos integralmente antes das alterações. Estado real inspecionado: collectors/normalização, ports/composition, JobMatch/MatchFeedback, auth/roles/seed, envs, storage, handlers, UI e testes. Mudanças pré-existentes foram preservadas. Decisões anteriores ao código em [PHASE_6_DECISIONS.md](PHASE_6_DECISIONS.md).

## Swile: decisão final e evidências

**Swile / Lever foi incorporada**, sem fallback Ubiminds: board e endpoint estavam disponíveis e tinham vagas brasileiras úteis, incluindo tecnologia/remoto. Consultados novamente:
- [Carreiras Swile Brasil](https://www.swile.com.br/carreiras).
- [Board público Swile](https://jobs.lever.co/swile).
- [Lever Postings API oficial](https://github.com/lever/postings-api/blob/master/README.md).
- [Termos Lever atuais](https://www.lever.co/legal/terms-of-service).

Endpoint HTTPS fixo: `https://api.lever.co/v0/postings/swile?mode=json`. Só postings públicos GET JSON. Não foram acessados candidatos, dados internos, aplicações, LinkedIn ou scraping. Documentação oficial descreve a superfície pública e uso por terceiros; não presumimos licença irrestrita de marcas/dados privados nem parceria. Nenhuma key é necessária ou enviada ao browser.

Coleta prévia somente para contagem: 29 postings, 14 com evidência Brasil, 6 desses remotos. Depois da implementação, persistência no banco local configurado:

| Execução Swile | Retornados/aceitos | Brasil-first | Inseridos | Duplicados | Rejeitados/omitidos |
| --- | ---: | ---: | ---: | ---: | ---: |
| Primeira | 29 | 14 | 29 | 0 | 0 |
| Replay | 29 | 14 | 0 | 29 | 0 |

Contagem brasileira confirmada sobre rows persistidas: **8 locais + 6 remote Brasil**, nenhuma worldwide/LATAM neste feed. Os outros 15 postings ficam fora das recomendações principais; não são descartados do catálogo global. Nenhuma descrição, conteúdo profissional ou PII é publicada neste relatório.

CI&T: 205 coletadas/duplicadas, zero inseridas nas duas execuções; continua com seu sourceId. Trabalho anterior foi preservado. Arbeitnow: primeira execução 325 coletadas, 13 novas e 312 duplicadas; replay 325/0/325. **338 vagas Arbeitnow persistidas**, incluindo as 325 anteriores, sem exclusão ou mistura de fontes. Usuários locais elegíveis=0; matches reais gerados=0. Não foram criadas contas privadas para simular uso. Testes multiusuário usam schemas temporários.

Tentativa sandbox falhou por restrição de rede; execução autorizada fora dele passou. Swile não teve omissões; CI&T continua registrando somente a contagem de seu posting sem descrição.

## Arquitetura e segurança Lever reutilizada

Adapter único **LeverJobCollector**, configurado apenas com chave allowlisted server-side `ciandt`/`swile`. Configuração contém company/sourceName/boardToken/host/endpoint conhecidos. Constructor rejeita chaves não configuradas; usuário não pode fornecer boardToken/URL. CiandtJobCollector foi removido, sem criar SwileJobCollector duplicado.

Mesmos JobCollector port, normalizador, repository createMany/skipDuplicates, sourceIds e constraints. Pipeline mantém ordem CI&T → Swile → Arbeitnow; falha Swile fica como failed=true sanitizado, sem abortar as outras fontes ou matching de dados já persistidos. A flag active existente é respeitada; ensure não reativa fonte desligada.

Preservados HTTPS, credentials omit/no-store, zero redirects, prazo 15s por tentativa/stream, response real até 4 MiB, até 1000 postings, status/content-type/UTF-8/JSON/schema Zod v4, máximo dois attempts com backoff 750ms somente para falhas temporárias. 429 não é repetido imediatamente. Links HTTPS/host jobs.lever.co devem pertencer ao board configurado e passam pelo normalizador seguro; nunca são buscados. Strings externas permanecem dados não confiáveis e são renderizadas escapadas.

**Mesma política brazil-eligibility da Fase 5**, sem regra especial Swile: localização Brasil local/remote, ou remoto LATAM/worldwide explícito. REMOTE sem evidência não basta. Sem LLM ou mudança nos pesos.

## Feedback e retenção

Antes do feedback, a exclusão de JobMatch inelegível foi substituída por **ocultação via geographyRank=3**. Não há nova entidade/migration. A leitura já exclui esse rank; feedback histórico e o ID do match permanecem. Replay/reativação reutilizam a mesma row e feedback. Fonte inativa oculta, sem apagar Jobs/MatchFeedback.

O método histórico removeIneligible foi preservado na interface para minimizar mudanças, mas agora executa updateMany owner+job, não deleteMany. Exclusão explícita de conta/Job continua com as relações/cascades existentes; não há endpoint destrutivo novo nesta fase. Feedback não é um snapshot do anúncio e não há adaptação de pesos.

PUT /api/job-matches/:id/feedback:
- Sessão obrigatória; userId exclusivamente do user.id autenticado.
- ID UUID validado; tipo RELEVANT/NOT_RELEVANT com Zod4/PT-BR.
- Body limitado a 64 KiB/deadline 10s pelo adapter existente; origin/cross-site rejeitados.
- Repository verifica JobMatch id+userId em transação, confere ownership de feedback anterior e faz upsert atômico por jobMatchId. Não mapeia identidade/role do body.
- USER e ADMIN não podem avaliar match alheio: 404 indistinguível de inexistente; sem sessão 401, payload/ID inválido 400, origem 403, limiter 429, falha inesperada 500 genérico.
- Resposta contém somente tipo; todas no-store. Limiter local 60 tentativas/minuto/owner.
- /jobs ganhou botões, estado inicial, loading/save feedback/erro e timeout client 15s. DTO agora expõe **somente o JobMatch.id necessário para esta ação e tipo do feedback do owner**, não jobId/userId/IDs de feedback/timestamps privados. O ID não concede autorização.

## Admin mínimo

/admin usa requireAdminUser server-side. GET /api/admin/operations e PUT /api/admin/job-sources/:id também usam o guard. APIs retornam 401 sem sessão e 403 para USER, no-store.

Métricas: usuários/jobs/matches/feedbacks agregados e fontes (id/name/active), sem emails, currículo, Profile/Preference, hashes/tokens ou conteúdo dos matches. Lista de fontes limitada a 100. Matches incluem histórico oculto.

Toggle valida UUID/boolean, atualiza exclusivamente active e é idempotente. Body não controla baseUrl/name/owner/role. CSRF/body limits e limiter local 60/min/admin. UI mostra feedback de save/erro e atualiza via router.refresh.

ADMIN mantém /jobs pessoal e todos os fluxos USER; link Minhas vagas preservado. Sem impersonation, leitura privada de terceiros, edição de role/perfil ou trigger administrativo do pipeline. Não havia mecanismo persistente adequado de última execução; tela informa indisponibilidade e uso de logs operacionais, sem inventar timestamp.

## Vercel e estado real do scheduler

Usuário confirmou **Vercel** durante a execução. Consultados:
- [Cron overview](https://vercel.com/docs/cron-jobs).
- [Segurança/manutenção](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- [Limites/preços](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- [Duração de Functions](https://vercel.com/docs/functions/configuring-functions/duration).
- [Plano Hobby](https://vercel.com/docs/plans/hobby).

vercel.json configura uma execução diária `0 6 * * *`. O cron Vercel faz **GET**; adapter GET foi adicionado ao endpoint interno, reutilizando autorização/limiter/RunDailyJobPipeline do POST e CLI. GET requer CRON_SECRET=INTERNAL_JOBS_SECRET; ambos server-only, iguais, aleatórios 32..256 chars. Vercel envia Authorization Bearer automaticamente com CRON_SECRET. Não aceita cookie/role/user-agent como autenticação; query recusada; comparação do token via hashes/timingSafeEqual existente. Nenhum valor real em .env.example.

maxDuration=300. Hobby documenta 300s máximo e cron diário com precisão por hora (06:00–06:59 UTC), consumindo quotas. Confirmar configuração/Fluid Compute do projeto; orçamento de 240s no loop de matching é best-effort, sem cancelamento global de uma coleta/query em andamento. Sem background após resposta, setInterval, Redis, filas ou worker dedicado.

**Status real: configurado no repositório, NÃO ativo/verificado em produção.** Não há .vercel/project.json/projeto remoto vinculado nesta workspace; nenhuma env/deployment/scheduler remoto foi configurado nesta tarefa. [DAILY_JOBS_SETUP.md](DAILY_JOBS_SETUP.md) foi atualizado com passos de ativação e alternativas zero-cost.

Hobby é destinado a uso pessoal não comercial: confirmar adequação da validação antes de usar esse plano; nenhum plano pago foi escolhido/contratado. Se uso comercial não for permitido no plano gratuito, permanece blocker de escolha de hosting/plano, sem trocar plataforma silenciosamente.

## Hardening realizado

- Login/register: CSRF/origin, content-type JSON, body real 64 KiB/deadline 10s, no-store em todos os status, email até 254 e senha até 72 bytes (limite bcrypt). Login de identidade ausente realiza custo bcrypt sem credencial/hash fixo para reduzir diferença de timing.
- Limiters locais limitados a 2000 chaves: login 100/min global + 15/15min por email; cadastro 30/min global + 5/h por email. Email é normalizado e hashed para chave; não logado. Retry-After em 429. Não depende de IP/header não confiável. **Memória por processo, não distribuído**, com possível bloqueio de disponibilidade por abuso e bypass multi-instância; não é garantia de defesa contra credential stuffing na Vercel.
- Upload: limiter 10/user/h e controles existentes preservados; continuam locais. Não houve mudança na compensação/validação/storage keys/ownership.
- Logout: origin/no-store e erro genérico/fixed log. Health ganhou no-store.
- Runtime DB: URL PostgreSQL validada com erro de configuração genérico; conexão 5s/statement 15s, log:[].
- B2: configuração exige HTTPS sem credenciais embutidas, erros de env não incluem issues/valores raw. SDK maxAttempts=2, connectionTimeout=5s/requestTimeout=15s com throwOnRequestTimeout=true (a versão Smithy instalada só emitiria warning sem essa flag). Operações/compensação preservadas. Deadline total de leitura futura de downloads ainda deve ser verificado separadamente.
- ACL remoto B2 consultado em modo read-only: **1 grant, nenhum grant público**. Isso não é auditoria completa de IAM/policy/least privilege. Nenhuma policy/ACL foi alterada.
- Headers: nosniff, DENY, referrer policy, permissions camera/mic/geolocation bloqueadas, CSP frame-ancestors/object/base/form e HSTS em produção. CSP atual não contém política de scripts completa; nonce/enforcement de scripts precisa teste de hidratação próprio antes do deploy.
- Logs novos/revistos são mensagens fixas/eventos/contagens, sem payload/PII/exceptions raw. Secrets não estão em NEXT_PUBLIC; nenhuma .env/key/pem está versionada ou foi adicionada.
- Roles/seed: arquitetura e políticas preservadas. Seed idempotente, hash/validação/revogação isolada testados na integração existente; nenhum seed real foi executado. Quatro migrations existentes estão aplicadas no banco local; nenhuma migration nova nesta fase.

## Auditoria de dependências

A auditoria inicial de produção encontrou 16 avisos, incluindo 1 crítico e 6 altos. Corrigido Next.js 16.3.4 → **16.3.8**, eslint-config-next correspondente, patches transitivos permitidos e @types/node → 24.19.1 para corresponder ao Node24/Vitest. Sem nova dependência, sem mudar Prisma7/Zod4. Instalações usaram ignore-scripts para evitar side effects de scripts externos. package.json e pnpm-lock.yaml revisados; Prisma permanece 7.10.0. Peer check final passou.

[Advisory Next/og](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) e [SSRF image optimization](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) consultados. A presença de advisory não prova exploração; as superfícies específicas não foram implementadas no produto, mas o patch foi aplicado.

**Auditoria final NÃO limpa: 3 altos + 4 moderados, 0 críticos**, todos nos caminhos opcionais/transitivos do Prisma CLI sob @prisma/client:
- lodash 4.17.21 — code injection/prototype pollution, [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh), [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg).
- deepmerge-ts 7.1.5 — recursive graph exhaustion, [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), patch exige 8.x.
- mysql2 3.15.3 — downgrade/compressed protocol, [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3).
- fast-uri 3.1.7 — normalization, [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj).

Aplicação usa PostgreSQL, não MySQL/Studio/streams-local/config merge de input web. Isso limita superfície observada, não elimina todos os riscos da árvore instalada. Não foram forçados overrides incompatíveis ou Prisma8. **Resolver/revisar alcance e empacotamento desses advisories é blocker de aprovação de deploy**, não declarar audit aprovado. ESLint9 também emite aviso de fim de suporte; atualização principal exige revisão própria.

## Verificação final

Após patches e alterações finais:
- **104 testes focados / 9 arquivos passaram**: providers com mocks (CI&T/Swile/Arbeitnow), geografia, limits/deadlines/429/5xx/redirect/unsafe URL, logs, feedback/ADMIN/CSRF/ID/owner, rate limit real HTTP, UI SSR.
- **26 PostgreSQL / 5 arquivos passaram**, em schemas locais temporários removidos. Seis novos cobrem feedback/replay/concorrência/cross-user/retenção, toggle/métricas e isolamento CI&T/Swile. Quatro matching anteriores continuam passando com retenção nova.
- **410 testes / 40 arquivos na suíte completa passaram**, sem skips, incluindo B2 real e todos os PG. Repetidos após patch Next/tipos Node.
- `pnpm exec tsc --noEmit --incremental false`, `pnpm lint`, `pnpm build` passaram; build usa Next16.3.8 e confirma APIs/admin/jobs dinâmicos.
- `git diff --check` passou. Peer check final: sem problemas. Prisma migrate status: quatro migrations, banco atualizado.
- `pnpm audit --prod --json`: exit1 pelos 7 avisos restantes descritos, não falha de rede na repetição autorizada.
- Smoke local do servidor Next production: /api/jobs=401, /api/admin/operations=401, cron GET=503 sem configuração, /jobs=200 com mensagem de login; APIs no-store/página private no-store, nosniff/DENY/CSP presentes. Processo local encerrado após check. Não houve navegador interativo/deploy.
- Coleta Swile real + replay e contagem DB passaram conforme tabela. Não foram emitidos bodies/descriptions/secrets.

Comandos na raiz (pnpm.cmd nesta sessão Windows):
```powershell
pnpm exec vitest run tests/app/api/feedback-admin.test.ts tests/app/api/vercel-cron.test.ts tests/infrastructure/jobs tests/infrastructure/http/auth-hardening.test.ts tests/features/admin-feedback.test.tsx tests/features/jobs-page.test.tsx tests/application/jobs/daily-pipeline.test.ts
$env:JOBCOPILOT_DB_TESTS='1'
pnpm exec vitest run tests/integration
pnpm test
pnpm jobs:run
pnpm jobs:run
pnpm exec prisma migrate status --config prisma7.config.ts
pnpm build
pnpm exec tsc --noEmit --incremental false
pnpm lint
pnpm peers check
pnpm audit --prod --json
git diff --check
```

## Arquivos desta fase

Criados:
- docs/PHASE_6_DECISIONS.md
- docs/PHASE_6_REPORT.md
- infrastructure/jobs/lever-job-collector.ts
- domain/jobs/feedback.ts
- application/jobs/ports/feedback-repository.ts
- application/jobs/save-match-feedback.ts
- infrastructure/database/prisma/repositories/feedback-repository.ts
- infrastructure/composition/feedback.ts
- infrastructure/http/operation-error.ts
- infrastructure/http/auth-rate-limit.ts
- infrastructure/http/safe-origin.ts
- shared/errors/not-found-error.ts
- shared/config/database-env.ts
- app/api/job-matches/[id]/feedback/route.ts
- features/jobs/feedback-controls.tsx
- application/admin/ports/operations-repository.ts
- application/admin/get-operations.ts
- application/admin/set-job-source-active.ts
- infrastructure/database/prisma/repositories/operations-repository.ts
- infrastructure/composition/admin-operations.ts
- app/admin/page.tsx
- app/api/admin/operations/route.ts
- app/api/admin/job-sources/[id]/route.ts
- features/admin/source-toggle.tsx
- vercel.json
- tests/infrastructure/jobs/swile-job-collector.test.ts
- tests/app/api/feedback-admin.test.ts
- tests/app/api/vercel-cron.test.ts
- tests/infrastructure/http/auth-hardening.test.ts
- tests/integration/feedback-sources-admin.test.ts
- tests/features/admin-feedback.test.tsx

Atualizados:
- shared/config/job-source.ts
- infrastructure/composition/daily-job-pipeline.ts
- infrastructure/database/prisma/repositories/matching-repository.ts
- application/jobs/ports/matching-repository.ts
- application/jobs/run-daily-job-pipeline.ts
- app/jobs/page.tsx
- app/api/internal/jobs/run/route.ts
- .env.example
- features/auth/schemas/login-schema.ts
- features/auth/schemas/register-schema.ts
- application/auth/login-user.ts
- app/api/auth/login/route.ts
- app/api/auth/register/route.ts
- app/api/auth/logout/route.ts
- app/api/health/route.ts
- infrastructure/database/prisma/client.ts
- shared/config/env.ts
- infrastructure/storage/b2/client.ts
- next.config.ts
- package.json
- pnpm-lock.yaml
- tests/infrastructure/jobs/ciandt-job-collector.test.ts
- tests/features/jobs-page.test.tsx
- tests/integration/job-matching.test.ts
- tests/application/jobs/daily-pipeline.test.ts
- docs/DAILY_JOBS_SETUP.md
- docs/CODEX_HANDOFF.md

Removido: infrastructure/jobs/ciandt-job-collector.ts (substituído pelo adapter Lever). Sem mudança de schema/migrations, port JobCollector, constraints, normalizador/geografia/pesos ou serviços pagos.

## Checklist de segurança

| Item | Resultado |
| --- | --- |
| Trust boundary | Sessão do banco para feedback; role do banco para admin; Bearer operacional para cron; feed externo não confiável. |
| Inputs/validação | UUID/enum/boolean, Zod4/PT-BR, HTTP/campos/arrays/UTF-8/tamanho/deadline, board allowlisted. |
| Ownership/IDOR | Feedback usa parent id+userId e confere child owner; ADMIN não ganha acesso privado. PG/cross-user testados. |
| Secrets/browser | Env server-only, exemplos vazios, nenhuma key do provider; DTO só ID do recurso necessário/feedback próprio. |
| Logs | Sem bodies, emails, cookies, tokens, hashes ou exceptions raw; somente métricas/eventos fixos. |
| Externas/timeout/limites | Lever/Arbeitnow fixos HTTPS; response4MiB/1000; deadlines/retry; B2/DB com limites explícitos. |
| SSRF/XSS/command | Sem URL/board cliente, redirects/fetch de links/HTML raw/shell; React escapa textos. |
| Mass assignment/SQL | Campos explícitos; toggle só active; Prisma e lock SQL fixo parametrizado. |
| Corridas/replay | Upserts/unique constraints/transação feedback/lock compartilhado; replay real/PG e concorrência passaram. |
| Erros/negativos | 400/401/403/404/429/500/503 controlados/no-store; limites/payload/cross-site/provider falhas testados. |
| ADMIN | Guards no servidor em página e todas APIs administrativas; sem impersonation/pipeline comum. |
| Retenção | Inelegível ocultado; feedback preservado e reaparece na reativação. |

## Blockers para deploy e dívidas restantes

1. **Advisories transitivos:** auditoria final exit1, 3 altos/4 moderados. Resolver ou concluir revisão documentada de exposição/artefatos antes de aprovar publicação.
2. **Vercel ainda não ativada:** vincular projeto, configurar Production envs/secret iguais, banco remoto/TLS/session connection, confirmar plano/uso permitido, deploy e verificar cron no dashboard/logs. Não há coleta automática em produção comprovada.
3. **Capacidade/abuso multi-instância:** limiters login/register/upload/feedback/admin/cron são locais. Para abertura pública na Vercel, definir controle compartilhado/limites de plataforma adequados sem serviço pago implícito. Eles não eliminam brute force/DoS global; cadastro mantém 409 e pode permitir enumeração por status.
4. **Produto público end-to-end:** UI login/registro ainda não existe; onboarding e páginas pedem login, mas acesso atual exige APIs/sessão já criada. Completar UX de autenticação e smoke com duas contas reais antes de convidar usuários.
5. **Duração real:** zero usuários locais elegíveis nesta coleta; não há prova de throughput multiusuário em 300s. Match O(users×jobs), upserts individuais, budget best-effort, sem checkpoint global. Medir no destino antes de ativar para usuários; replay recupera sem duplicar.
6. **Headers/storage:** CSP atual é parcial (framing/object/base/form), sem script-src nonce. Fazer teste de hidratação/abuso em navegador. ACL sem grant público foi verificada, mas auditoria de key/policy/least privilege e TLS/backups DB permanece operacional.
7. **Histórico/feedback:** mantém último tipo, não trilha de mudanças/snapshot de score/conteúdo; exclusão explícita de conta/job ainda faz cascade. Não há delete novo, expiração de vagas nem atualização de duplicadas.
8. **UX/testes:** SSR/API/PG/smoke HTTP cobertos; não houve interação real em navegador com save/toggle. Admin não tem timestamp persistido de pipeline; ausência foi indicada.
9. **Auth legado:** limite72bytes pode rejeitar senhas antigas maiores que bcrypt anteriormente truncava; fluxo de recuperação de senha ainda não implementado. Envs exclusivas de seed continuam opcionais; bootstrap só manual.
10. **GC/Scheduler:** cron preparado nesta fase somente para jobs. GC de resumes ainda não integrado ao agendamento; compensação e janela24h foram preservadas.

Não houve deploy, upgrade pago, LLM enrichment, auto apply, realtime, Redis/BullMQ ou microserviço.
