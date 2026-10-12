# Fase 7 — backend multiusuário e preparação de produção

Data: **2026-10-08**. Os treze documentos solicitados foram lidos integralmente, na ordem, e o repositório real foi inspecionado antes das edições. Fases anteriores e alterações pré-existentes preservadas. Nenhum frontend adicional, LLM, auto-apply, Redis/BullMQ, microserviço ou serviço pago foi introduzido.

## Status final e limites da conclusão

Backend implementado e validado localmente, com isolamento multiusuário, rate limit compartilhado, GC agendável, lifecycle conservador e pipeline recuperável. **Não está implantado nem com coleta automática comprovada em produção.** A liberação depende da execução do [BACKEND_PRODUCTION_CHECKLIST.md](BACKEND_PRODUCTION_CHECKLIST.md): vínculo/deploy Vercel, envs, PostgreSQL remoto/TLS/pool, backup/restore, policy B2, plano permitido e verificação dos crons reais.

O audit permanece exit1 por **dois altos e um moderado exclusivamente do tooling Prisma**, aceitos mediante evidência de ausência no runtime. Não há crítico conhecido nessa auditoria; não declarar audit limpo. Análise detalhada em [DEPENDENCY_EXPOSURE_REPORT.md](DEPENDENCY_EXPOSURE_REPORT.md).

## Decisões e mudanças mínimas

1. PostgreSQL existente para rate limiting distribuído, sem credencial/serviço adicional: port RateLimiter, implementação local dev/test e PostgresRateLimiter produção.
2. Dois crons independentes para jobs e GC; evita acoplar disponibilidade/deadline/B2 ao pipeline de vagas e usa os mesmos mecanismos de autorização/limiter/locks.
3. Migration **aditiva Prisma 7**: Job.active/lastSeenAt; duas tabelas estritamente operacionais RateLimitBucket e JobPipelineState para contagem/retomada. Sem novas entidades profissionais, alteração de constraints de dedupe ou apagamento de histórico.
4. Pipeline com lotes, deadline/cancelamento cooperativo e checkpoint transacional com os upserts. Não mantém transação durante HTTP externo.
5. Cadastro público retorna resposta201 idêntica para identidade nova/existente, corrigindo a enumeração por409 identificada na Fase6. A conta existente não é modificada; role/seed/ownership não foram redesenhados.

## Dependency security e empacotamento

Consultados advisories oficiais, registry e árvore real. Upgrade transitivo compatível: lodash 4.18.1 e fast-uri 3.1.8; quatro avisos resolvidos. mysql2 permanece 3.15.3 fixado pelo Prisma 7.10.0; deepmerge-ts 7.1.5 tem correção major 8, não forçada. Prisma 7.10.0 foi confirmado como última versão7 disponível; sem Prisma 8/overrides.

Audit final: **0 críticos / 2 altos / 1 moderado**. Restantes: deepmerge-ts GHSA-ggr8-5vv4-36mx alto; mysql2 GHSA-3f6p-5ww8-9rcr alto e GHSA-rgwj-5xj2-c3m3 moderado. Caminhos passam pelo peer CLI Prisma, não pelo client PostgreSQL usado no HTTP.

Next standalone gerado e inspecionado: **22 traces, 551 arquivos referenciados distintos e 1751 arquivos standalone**, zero arquivos dos quatro pacotes auditados. `pnpm backend:exposure` é gate reproduzível que retorna falha se esses pacotes forem incluídos. Aceitação circunscrita ao tooling controlado, não ao empacotamento de node_modules inteiro; revisar artefatos Vercel após deploy.

## Rate limiting multi-instância

Pesquisa: [WAF Vercel](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) oferece regra Hobby limitada e contagem regional, com quota e cobrança potencial. Não foi ativado/contratado. Não exige novo provider porque o PostgreSQL existente oferece contagem compartilhada entre instâncias; WAF pode ser defesa adicional após revisão operacional.

Port assíncrono comum consume(rule) → Retry-After em segundos, zero quando permitido. PostgreSQL: transação curta + advisory lock **transacional** para serializar limite/capacidade, relógio do banco, purga de expirados, incremento atômico, teto **10mil keys**. Chaves têm escopo fixo + HMAC-SHA256 de identidade normalizada, sem email/userId plaintext. Secretserver-only 32..256. Não usa IP, X-Forwarded-For ou headers arbitrários do cliente.

| Operação | Limite |
| --- | --- |
| Login | 100/min global; 15/15min por email normalizado |
| Register | 30/min global; 5/h por email normalizado |
| Resume upload | 10/h por usuário autenticado |
| Feedback, source toggle, admin metrics | 60/min por owner e escopo |
| Profile/Preferences PUT | 60/min por owner e escopo |
| Cron jobs / GC | 5/10min por trigger; locks protegem execução simultânea |

429 preserva Retry-After. DB indisponível/key ausente/config inválida →503 genérico, **sem fallback silencioso em produção**. NODE_ENV=production defaults postgres e recusa local explícito. Local dev/test: Map com teto2mil e expiração, não distribuído. Configurar RATE_LIMIT_MODE=postgres explicitamente no destino. Limites globais podem prejudicar disponibilidade durante abuso; não equivalem a proteção completa contra DDoS.

Testes reais: duas instâncias concorrentes,20consumos/limite5 →exatamente5permitidos/15limitados; expiração reinicia;10milbuckets bloqueiam novo sem cardinalidade extra. Testes de seleção garantem fail-closed, HMAC e ausência de erro raw.

## GC de resumes e scheduler

GET/POST `/api/internal/resumes/gc`, somente Bearer operacional; GET exige CRON_SECRET=INTERNAL_JOBS_SECRET. maxDuration60/deadline45s. Advisory lock separado742911,3, independente de jobs742911,1; rate lock transacional742911,2. Falha GC não impede jobs nem matching.

CleanupOrphanedResumes preserva **janela24h**, referência DB e deletion **por versão** com listVersions/deleteVersion. UploadResume não chama GC; compensação B2/DB e exclusão antiga best-effort preservadas. Listagem B2 paginada, máximo10páginas/10milversões; markers repetidos/excesso falham fechado antes de excluir. DB maintenance limitada a100001keys e GC recusa acima100mil. SDK mantém conexão5s/request15s com throwOnRequestTimeout e dois attempts; AbortSignal propagado na manutenção.

Falha individual de exclusão vira contadorfailed/partial; outras versões elegíveis continuam quando há prazo. Replay não repete exclusão física já removida. Referenciados e recentes nunca são excluídos. Há testes com versões/delete markers sintéticos e integração B2 apenas sobre objetos sintéticos de teste; **não foi executada limpeza destrutiva de currículos reais**.

`vercel.json`: jobs **06UTC/03Brasília**, GC **07UTC/04Brasília**, uma vez/dia cada. [Cron nativo faz GET e suporta configuração diária](https://vercel.com/docs/cron-jobs/usage-and-pricing); precisão/quota devem ser confirmadas no plano. Nenhum scheduler remoto ativado. Sem setInterval/background pós-resposta. Configuração exata em checklist e [DAILY_JOBS_SETUP.md](DAILY_JOBS_SETUP.md).

## Job lifecycle e feedback

Job.lastSeenAt atualizado a cada observação válida; conteúdo/url/local/workModel/data atualizados mesmo em duplicadas. Job.active reativado quando reaparece. Identidade dedupada por source/externalId ou source/normalizedUrl; constraints mantidas e sourceIds independentes. Caso externalId e URL apontem a duas rows existentes, coleta falha controladamente: nunca sobrescreve ambos os históricos.

Após coleta completa/validada/persistida de uma fonte, Jobs ativos sem observação há **14 dias** são desativados. Fonte que falha, feed inválido, deadline ou lote incompleto **não expiram** vagas. Não há exclusão por simples ausência; API paginada/feed não constitui prova definitiva de fechamento, então a política é temporal conservadora.

Para falha permanente de fonte, matching/leitura não consideram Jobs sem observação há **30 dias**, mesmo se active ainda true. Fonte inativa também fica fora. Histórico e MatchFeedback permanecem; geografia inelegível continua oculta via rank3; reativação reutiliza Job/JobMatch/feedback. Rows anteriores receberam lastSeenAt da migration, garantindo janela inicial e evitando expiração em massa imediata. Nenhum dos registros anteriores de Arbeitnow foi removido.

## Pipeline robusto e medição

Deadline global **240s** inclui aquisição/execução; fontes recebem prazo restante/AbortSignal, timeoutHTTP15s limitado pelo prazo global, no máximo2attempts e backoff750ms. Cancelamento checado entre fontes, jobs e lotes; DB tem query timeout5s, transação5s/connect5s. Não promete interrupção instantânea de query pg em andamento.

Collections validam feed≤1000 antes de gravar; persistência em batches100. Contagens confirmadas após falha de lote ficam em erro tipado sanitizado, sem cause/body. Uma fonte inválida/falha não impede outras nem matching já persistido enquanto há prazo.

Usuários em páginas50, jobs em páginas100, bulk upsert parametrizado por owner/job. Checkpoint userCursor/jobCursor confirmado **na mesma transação** dos matches do lote; replay retoma último lote confirmado, não pula lote incompleto. Owner removido/inelegível é tratado. Ciclo completo limpa checkpoint. IDs dos cursors são internos e nunca publicados/logados. Bulk SQL usa identificador de schema estritamente validado/configuração interna e payload JSON parametrizado; testes usam schema explícito, sem escrever em public.

Teste de escala local: **10 usuários ×300jobs =3000matches**, primeira execução837ms, replay750ms, retomada771ms na medição focada. Replay criou0/atualizou3000; aborto após100 confirmou checkpoint; retomada atualizou2900 sem duplicação. Uma fonte falhou e os3000matches ainda foram processados. Deadline cooperativo testado com fonte lenta; lifecycle/staleness/identidade ambígua testados. Usuários sintéticos somente em schema temporário local, removido ao finalizar.

Coleta real em banco local existente, apenas dados públicos e nenhuma conta elegível criada:

| Fonte | Coletadas | Inseridas primeira execução | Duplicadas primeira | Replay inseridas/duplicadas |
| --- | ---: | ---: | ---: | ---: |
| CI&T | 202 | 12 | 190 | 0/202 |
| Swile | 29 | 1 | 28 | 0/29 |
| Arbeitnow | 325 | 288 | 37 | 0/325 |

Primeira4755ms, replay4666ms; fontes sem falha, desativadas/reativadas0; atualizadas/observadas556 em cada. CI&T omitiu1posting incompleto com contador sanitizado já existente. Usuários elegíveis0/matches0 no banco real local; não extrapolar a medição para carga remota Vercel. Os feeds podem mudar entre dias; IDs/descrições não são publicados aqui.

## Banco/Vercel

[Prisma 7 usa configurações do driver adapter para pool](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool). Runtime poolpg2/instância; connect/statement5s, idle10s. PostgreSQL remoto TLS com certificado verificado; flags sslmode não podem sobrescrever isso. Localhost permite desenvolvimento sem TLS. Não foi trocado provider nem criado banco pago.

DATABASE_URL runtime pode usar pooler transaction mode compatível; DIRECT_DATABASE_URL obrigatório na Vercel para locksession e migrations. CLI local pode usar fallbackDATABASE_URL. Prisma 7.config prefereDIRECT para migrate deploy/status. Locks de jobs/GC têm conexão dedicada, try-lock/finally unlock/end. Não manter session lock em pooler transaction mode. Rate limiter usa xact lock, compatível com transação curta.

Migrations:5aplicadas/up-to-date localmente, inclusive aditiva desta fase. Produção precisa aplicar migrate deploy antes do código, revisar orçamento de conexões por instâncias, TLS/CA e backups/restauração; essas condições não são provadas pela conexão localhost.

## Observabilidade e contratos auditados

Eventos JSON fixos started/completed/busy/failed, durationMs, sources(name fixa), coletadas/inseridas/duplicadas/observadas/desativadas/reativadas, usersProcessed, matchesUpserted/Created/Updated, partial/timedOut; GC candidates/deleted/skipped/failed. CLI emite mesmos contadores. Não loga email/profile/resume/password/token/cookie/secret/descrição ou exception raw. Logs legados de erro são mensagens constantes sanitizadas; não foram feitas refatorações cosméticas. Sem serviço externo obrigatório ou histórico completo de execuções.

Todos os14RouteHandlers auditados: auth(login/register/logout/me), resume, profile, preferences, jobs, feedback, admin(operations/source), internos(jobs/GC), health. Ownership da sessão e guardadmin preservados; ADMIN não recebe acesso implícito privado. PUTs autenticados rejeitam origem cruzada e limitam JSON64KiB/10s; Resume mantém PDF/DOCX5MiB e multipart limitado. Campos explícitos/Zod4PT-BR, sem mass assignment. Dados externos continuam escapados, semHTMLraw/LLM/shell/fetchURLs arbitrárias.

No-store presente inclusive erros de `/api/auth/me` (omissão encontrada/corrigida no smoke) e Resume. Erros inesperados têm mensagens genéricas; indisponibilidade operacional503, lock409, origem403, ownership404 e limites429. Cookie de sessão excessivo>128chars rejeitado antes de lookup. Cadastro201 público não expõeid/email/role e mantém custo bcrypt para novo/existente; concorrência unique traduzida para mesma resposta, sem reset de senha.

## Env/secrets

`.env.example` somente campos vazios, sem NEXT_PUBLIC secrets. Env production checker retorna apenas **nomes** de campos inválidos, nunca valores/issuesraw. Separação runtime/seed/cron/provider/build em checklist. Secrets dos providers Lever/Arbeitnow inexistentes; configuração/hosts allowlisted server-side preservados.

**Bug real de empacotamento encontrado:** Next standalone copiava a `.env` local para `.next/standalone/.env`. Nenhum valor foi exibido e nenhum artefato foi publicado. O build agora executa finalize-build, que remove `.env*` exclusivamente dentro do standalone gerado, sem tocar a configuração original. Vercel buildCommand foi fixado em `pnpm build`; o gate de exposição recusa env files e secrets locais embutidos em JS/JSON/HTML. Recomendação de rotação B2 reforçada por essa cópia local; não há evidência de exfiltração/deploy. O artefato final sanitizado contém **1750 arquivos**, zero env files/secrets locais encontrados, além de zero pacotes auditados.

Busca heurística + revisão dos pontos de env no working tree e **três commits existentes do histórico recente**: nenhum possível secret real encontrado em arquivo versionável/histórico. **Credenciais reais foram identificadas na `.env` local, ignorada pelo Git**, usadas na integração B2. Valores não reproduzidos. Recomenda-se rotacionar as chaves B2 antes do deploy e separar keys dev/test/produção; não foi observada exposição no histórico, nem feita rotação/revogação automática. O scanner classifica arquivos locais ignorados separadamente; não prova ausência de todos os formatos de segredo.

## Testes e gates

- Focados novos: distribuição/fail-closed/HMAC, GC/versões/paginação/cancelamento, cron409/503/auth/secrets, env/TLS, deadline/parcial/checkpoint/lifecycle/staleness/conflitos e smoke. Mocks de CI&T/Swile/Arbeitnow existentes mantidos.
- PostgreSQL opt-in em schemas temporários inclui USERA/USERB/ADMIN: registro/login/logout, Resume com storagefake pelo port, Profile/Preferences, jobs, feedback cross-user, admin métricas/toggle, cron auth/replay e GC/replay/parcial. Auth/Prisma/bcrypt reais; mock somente cookiesNext/contextHTTP, feeds públicos e storage no smoke. B2 tem teste separado real com arquivos sintéticos.
- Suite final: **436 testes /48 arquivos**, sem skip; inclui PostgreSQL e B2. Comando Windows pnpm.cmd equivalente a pnpm.
- `pnpm db:generate`, `pnpm exec prisma validate --config prisma7.config.ts`, `pnpm exec prisma migrate status --config prisma7.config.ts`, `pnpm exec tsc --noEmit --incremental false`, `pnpm lint`, `pnpm build`, `git diff --check`: passaram. Migrationdeploy local passou.
- `pnpm audit --prod`: exit1/3advisories CLI aceitos conforme exposição. `pnpm backend:exposure`: exit0/nenhum dos pacotes auditados no runtime. Scanner de secrets: exit0.
- `pnpm backend:env` na configuração local: exit1 esperado (banco localhost, envs de produção ainda ausentes); testes com configuração sintética válida passaram. O gate real de configuração Production continua pendente e não foi descrito como aprovado.
- B2: ACL somente proprietário e acesso anônimo negado para objeto sintético; versões de teste removidas. Privacidade verificada sem publicar IDs/keys/conteúdo.
- Tentativa inicial de B2 dentro do sandbox falhou por rede; repetição autorizada passou. Auditoria/listagem pnpm também exigiram rede/store autorizado; sem contornar permissões.

## Arquivos criados nesta fase

- application/operations/execution-context.ts
- application/security/ports/rate-limiter.ts
- application/jobs/collection-progress-error.ts
- application/resume/run-resume-gc.ts
- infrastructure/security/postgres-rate-limiter.ts
- infrastructure/composition/resume-gc.ts
- app/api/internal/resumes/gc/route.ts
- shared/config/backend-production-env.ts
- shared/errors/service-unavailable-error.ts
- prisma/migrations/20261007020000_backend_readiness/migration.sql
- scripts/finalize-build.mjs
- scripts/check-backend-env.ts
- scripts/check-runtime-exposure.mjs
- scripts/check-repository-secrets.mjs
- tests/integration/backend-test-database.ts
- tests/integration/backend-operations.test.ts
- tests/integration/backend-smoke.test.ts
- tests/application/jobs/pipeline-deadline.test.ts
- tests/application/resume/run-resume-gc.test.ts
- tests/infrastructure/backend-production-env.test.ts
- tests/infrastructure/http/distributed-rate-limit.test.ts
- tests/infrastructure/storage-maintenance.test.ts
- tests/app/api/backend-cron-contract.test.ts
- docs/PHASE_7_REPORT.md
- docs/BACKEND_PRODUCTION_CHECKLIST.md
- docs/DEPENDENCY_EXPOSURE_REPORT.md

## Arquivos atualizados nesta fase

- prisma/schema.prisma; prisma7.config.ts; next.config.ts; package.json; pnpm-lock.yaml; .env.example; vercel.json.
- application/auth/register-user.ts; application/jobs/collect-jobs.ts; application/jobs/run-daily-job-pipeline.ts; application/jobs/ports/job-collector.ts; application/jobs/ports/job-repository.ts; application/jobs/ports/matching-repository.ts; application/resume/cleanup-orphaned-resumes.ts; application/resume/ports/resume-storage-maintenance.ts.
- infrastructure/auth/session/session-cookie.ts; infrastructure/database/prisma/client.ts; infrastructure/database/prisma/repositories/user-repository.ts; resume-repository.ts; job-repository.ts; matching-repository.ts.
- infrastructure/composition/daily-job-pipeline.ts; infrastructure/http/auth-rate-limit.ts; resume-upload-limit.ts; account-data.ts; operation-error.ts; infrastructure/jobs/postgres-pipeline-guard.ts; read-source-json.ts; arbeitnow-job-collector.ts; lever-job-collector.ts; infrastructure/storage/b2/b2-resume-storage.ts; shared/config/database-env.ts; scripts/run-jobs.ts.
- app/api/auth/login/route.ts; register/route.ts; me/route.ts; app/api/resumes/route.ts; profile/route.ts; preferences/route.ts; admin/operations/route.ts; admin/job-sources/[id]/route.ts; job-matches/[id]/feedback/route.ts; internal/jobs/run/route.ts.
- tests/app/api/auth/roles.test.ts; tests/app/api/jobs.test.ts; tests/application/resume/cleanup-orphaned-resumes.test.ts; tests/infrastructure/http/resume-upload-limit.test.ts; tests/integration/job-collection.test.ts; professional-data.test.ts; job-matching.test.ts; feedback-sources-admin.test.ts; infrastructure/storage/b2/b2-resume-storage.test.ts.
- docs/CODEX_HANDOFF.md; docs/DAILY_JOBS_SETUP.md.

O working tree contém trabalho prévio não commitado das fases1–6; gitdiff contraHEAD não é inventário exclusivo desta fase. Nenhum arquivo de UI foi editado nesta fase.

## Blockers e dívidas restantes

**Operacionais antes de abertura pública:** ativar/verificar deploy e ambos crons; configurar secrets/DB remoto/TLS/pool e migration no destino; backup/restore e least privilege B2/DB; confirmar plano/uso permitido sem contratação implícita; medir latência/carga no destino e revisar artefatos Vercel. Checklist mantém itens pendentes explícitos, sem declaração de produção ativa.

**Dívidas controladas:** três avisosCLI fora do runtime; ESLint9 tooling sem suporte; limites globais podem permitir DoS de disponibilidade, locks/contagem PG seriados adequados ao alpha e sujeitos a medição; matchingO(users×jobs) e checkpoint de ciclo não representa snapshot global imutável (jobs inseridos com ID anterior podem ser vistos no próximo ciclo). Sem alertas externos/histórico de runs/retry automático; GC falha fechado acima10milversões/100milkeys até manutenção/revisão de capacidade. Feedback mantém último tipo sem snapshot; exclusão explícita de conta/Job ainda usa relações existentes, mas lifecycle não deleta. Recuperação/verificação de email e UX auth/full CSP/browser E2E pertencem ao backlog, sem frontend nesta fase. Não avançado para LLM/feedback learning ou features fora dobackend.
