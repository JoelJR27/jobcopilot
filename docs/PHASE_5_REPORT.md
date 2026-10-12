# Fase 5 — Brasil-first, matching v1, /jobs e pipeline diário

Data: 2026-10-07. Escopo explícito do usuário substitui a ordem histórica de enrichment. Nenhum LLM, feedback, admin, realtime, fila, worker dedicado ou candidatura foi implementado.

## Inspeção e decisões

Lidos AGENTS, handoff, plano, guia de segurança e relatórios anteriores. Confirmados JobSource/Job/JobMatch, constraints, schemas profissionais, collectors, composition, guard e testes reais. Matching/pipeline não existiam; /jobs era placeholder. Mudanças pré-existentes foram preservadas.

A decisão da fonte foi registrada **antes do código** em [PHASE_5_SOURCE_DECISION.md](PHASE_5_SOURCE_DECISION.md). A arquitetura mantém Next.js 16 full-stack, Prisma 7, Zod v4/PT-BR, ports/repositories/composition, sem src, dependência paga ou infraestrutura nova.

Uma migration aditiva acrescenta somente JobMatch.geographyRank (default 3, fora do feed principal) e índice para ordenação por owner/geografia/score. Todas as constraints existentes permanecem, inclusive dedupe qualificado pela fonte e Restrict de JobSource. Client regenerado; migration aplicada com sucesso no banco local configurado. As migrations anteriores já estavam aplicadas; roles/seed não foram reabertos.

Imports runtime dos dois schemas profissionais passaram de aliases a caminhos relativos .ts para permitir execução nativa Node 24 do pipeline. Validação e contratos não mudaram.

## Fonte brasileira

**CI&T / Lever Postings API**, feed JSON fixo HTTPS `https://api.lever.co/v0/postings/ciandt?mode=json`. Uma única nova fonte lógica, um empregador brasileiro com forte cobertura nacional; não é agregador nacional.

Consultados:
- [Adzuna overview](https://developer.adzuna.com/overview), [busca](https://developer.adzuna.com/docs/search), [referência](https://developer.adzuna.com/activedocs/), [termos](https://developer.adzuna.com/docs/terms_of_service).
- [Gupy autenticação](https://developers.gupy.io/docs/autentica%C3%A7%C3%A3o) e [permissões](https://developers.gupy.io/v2.0/docs/autentica%C3%A7%C3%A3o-recrutamento-sele%C3%A7%C3%A3o).
- [Lever documentação oficial](https://github.com/lever/postings-api), [suporte](https://hire.lever.co/developer/support), [termos atuais](https://www.lever.co/legal/terms-of-service).
- [Carreiras CI&T Brasil](https://ciandt.com/br/pt-br/carreiras/oportunidades).

Adzuna foi avaliada primeiro, para Brasil. Exige credenciais não configuradas; não presumimos plano/licença habilitados. Seus termos distinguem publicação de anúncios de outros usos contínuos. Gupy exige token/permissões empresariais, não sendo assumida como agregador aberto. Boards Nubank e CloudWalk verificados retornaram zero vagas, não foram implementados.

Lever documenta acesso público a postings publicados e utilização por terceiros. Não acessamos ATS interno, candidatos ou aplicações. Não contratamos serviço Lever nem usamos scraping. Links e nome da fonte atribuem a origem; não incorporamos marcas/logos ou alegamos parceria. Termos/cobertura precisam ser reavaliados se mudarem.

## Segurança da fonte e secrets

CI&T/Lever não exige API key: nenhuma key é criada, persistida ou enviada ao browser. DATABASE_URL e INTERNAL_JOBS_SECRET são server-only; .env.example contém nomes vazios. Secret do cron apenas em Authorization Bearer, nunca query string.

Fetch com endpoint constante, HTTPS, credentials omit/no-store, zero redirects, timeout 15s incluindo stream, limite real 4 MiB, validação status 200/application-json/UTF-8/JSON/schema. Até 1000 postings; no máximo dois attempts, backoff 750ms só em network/timeout/5xx sem Retry-After. 429 não provoca retry imediato. Links originais devem usar HTTPS/host jobs.lever.co/path ciandt e passam pelo normalizador seguro; nunca são buscados no servidor.

Campos externos limitados e explicitamente mapeados; country=BR é convertido em evidência Brasil na localização. Modelo vem de workplaceType. createdAt é timestamp do provider. Descrição utiliza descriptionPlain, listas e additionalPlain; markup eventual é dado não confiável. Nada interpreta/executa HTML/scripts/shell. Um posting estruturalmente válido sem qualquer descrição foi omitido e contado em log sanitizado; outros payloads inválidos falham fechado antes de persistir.

Arbeitnow permanece intacta, independente, secundária. SourceIds não foram misturados. Nenhuma vaga foi excluída. Deduplicação continua createMany/skipDuplicates e constraints; conteúdo de duplicadas não é atualizado.

## Política Brasil-first

Gate determinístico **antes do score**:
1. Rank 0: localização brasileira reconhecida, não remota.
2. Rank 1: remoto com localização explicitamente Brasil.
3. Rank 2: remoto explicitamente LATAM/Latin America/América Latina/worldwide/anywhere/global remote.
4. Rank 3: desconhecida ou estrangeira sem evidência brasileira — fora das recomendações principais.

Reconhece Brazil/ Brasil/ BR como tokens e lista conservadora de cidades/capitais e estados. Não é geocoding universal. Evidência vem somente da localização estruturada, nunca de menção na descrição, nacionalidade da empresa ou LLM. REMOTE sozinho não basta. Internacional presencial ou remoto restrito a país estrangeiro fica fora; worldwide explícito entra depois de Brasil. Preferências internacionais não desativam o gate nesta versão Brasil-first.

## Matching

Pesos explícitos: cargo 30, habilidades 35, senioridade 15, modelo 10, localização 10. Score arredondado 0..100; **compatibilidade, não probabilidade de contratação**.

Cargo: ocorrência delimitada no título, desiredRoles (Profile.roles é fallback). Habilidades: desiredSkills quando preenchidas, senão Profile.skills; pontos proporcionais aos termos identificados no título/descrição. Texto tem case/acento normalizados; Java não corresponde a JavaScript. Não há sinonímia/tradução ou compreensão semântica. Senioridade: termos explícitos no título e comparação com Preference.seniority; desconhecido não ganha pontos. WorkModel compara enum explícito com preferências. Localização usa preferência textual quando preenchida; caso contrário o gate elegível recebe 10.

Persistência com upsert userId+jobId, score/matchedCriteria/missingCriteria/geographyRank. Usuários processados só possuem Profile/Preference válidos pelos schemas atuais; USER/ADMIN participam igualmente. Leituras profissionais explicitamente selecionadas, sem email/hash/resume/storageKey. Não há atualização do perfil pelo pipeline.

Replays não duplicam matches. Um match que deixe de ser geograficamente elegível é removido por owner+job; Jobs permanecem. Reavaliar retenção de feedback antes de implementar feedback, pois a relação existente faz cascade se o match for removido.

## /jobs e API

Página dinâmica com autenticação server-side, dados exclusivamente do user.id da sessão. GET /api/jobs também deriva identidade da sessão e usa no-store em todos os status. Query userId/role não controla ownership. ADMIN não vê matches alheios.

Ordenação no PostgreSQL: geographyRank ASC, score DESC, publishedAt DESC NULLS LAST e id como desempate. Fonte inativa e rank>=3 não aparecem; geografia e segurança do link são conferidas novamente na leitura. Paginação 20, página limitada a 1000.

Cards exibem score, title/company/location/workModel/source/date, razões atendidas/ausentes e link original com noopener/noreferrer. Strings são escapadas pelo React, sem HTML raw. Loading, erro genérico, vazio e dados profissionais incompletos estão implementados. Sem dashboard novo.

## Pipeline e scheduler preparado

RunDailyJobPipeline coleta CI&T e Arbeitnow configuradas/ativas, persiste/deduplica, pagina usuários (50) e jobs (100), calcula/upserta e retorna contagens. Falha de uma fonte não bloqueia fallback/matching de vagas já existentes; CLI exit code 1 para falha parcial/total, HTTP 503 para parcial. Nenhum body/exception raw em logs. Sem transação aberta durante HTTP.

`pnpm jobs:run` e POST /api/internal/jobs/run chamam a mesma composição/use case. `pnpm jobs:collect` anterior foi preservado para Arbeitnow. Lock advisory PostgreSQL numa sessão dedicada protege execuções concorrentes entre instâncias e libera no fim; não introduz entidade/Redis/queue. SQL de lock é fixo e parametrizado. Usar conexão direta/sessão, não pooler transaction mode.

Endpoint cron: secret obrigatório 32..256 caracteres; comparação de hashes timingSafeEqual; cookies USER/ADMIN não autorizam. Query string recusada. Configuração ausente retorna 503, credencial inválida 401; ocupado 409; limiter HTTP local de dez minutos 429. Não retorna sources/counts/IDs/stack. Limiter é best-effort por processo, **não distribuído**; lock compartilhado é proteção de concorrência, não rate limiter.

**Frequência prevista: diária, 06:00 UTC / 03:00 Brasília.** Adapter CLI + adapter HTTP executáveis e [instruções de cron](DAILY_JOBS_SETUP.md) estão preparados. Plataforma de deploy ainda não definida; nenhum fornecedor/agendamento em produção foi ativado. Ativar/verificar cron e limite de duração do host é requisito de deploy. maxDuration=300 é solicitação do adapter, não garantia de plano. Não há execução em background após resposta nem setInterval.

## Coleta real controlada

Banco local configurado, após a migration aditiva:

| Execução | CI&T coletadas | Inseridas | Duplicadas | Arbeitnow coletadas/inseridas/duplicadas |
| --- | ---: | ---: | ---: | --- |
| Primeira válida | 205 | 205 | 0 | 325 / 0 / 325 |
| Replay | 205 | 0 | 205 | 325 / 0 / 325 |

Feed CI&T: 206 postings, 175 country=BR; 1 posting BR sem descrição omitido. **174 vagas brasileiras persistidas**, 205 totais, confirmado por contagem no DB sem conteúdo/PII. Os outros 31 postings não são presumidos elegíveis pelo matching. Os 325 registros Arbeitnow foram preservados.

Usuários elegíveis reais: 0; matches reais gerados: 0. Não criamos/alteramos contas privadas para fabricar demonstração. Matching/persistência multiusuário foram verificados em schema PostgreSQL temporário. Primeira tentativa de rede falhou no sandbox; rerun autorizado funcionou. Uma primeira coleta com adapter encontrou descrição vazia e falhou fechado; esse caso recebeu tratamento específico e teste, seguido por duas execuções bem-sucedidas.

## Arquivos desta fase

Criados:
- docs/PHASE_5_SOURCE_DECISION.md
- domain/jobs/brazil-eligibility.ts
- domain/jobs/match-job.ts
- application/jobs/ports/matching-repository.ts
- application/jobs/run-daily-job-pipeline.ts
- application/jobs/get-recommended-jobs.ts
- infrastructure/jobs/read-source-json.ts
- infrastructure/jobs/ciandt-job-collector.ts
- infrastructure/jobs/postgres-pipeline-guard.ts
- infrastructure/database/prisma/repositories/matching-repository.ts
- infrastructure/composition/daily-job-pipeline.ts
- infrastructure/composition/recommended-jobs.ts
- infrastructure/http/internal-jobs-auth.ts
- scripts/run-jobs.ts
- app/api/jobs/route.ts
- app/api/internal/jobs/run/route.ts
- app/jobs/loading.tsx
- app/jobs/error.tsx
- prisma/migrations/20261007010000_job_match_geography/migration.sql
- tests/domain/jobs/matching.test.ts
- tests/application/jobs/daily-pipeline.test.ts
- tests/infrastructure/jobs/ciandt-job-collector.test.ts
- tests/app/api/jobs.test.ts
- tests/features/jobs-page.test.tsx
- tests/integration/job-matching.test.ts
- docs/DAILY_JOBS_SETUP.md
- docs/PHASE_5_REPORT.md

Atualizados:
- shared/config/job-source.ts
- prisma/schema.prisma
- domain/profile/profile.ts (somente import runtime)
- domain/preferences/preferences.ts (somente import runtime)
- package.json
- .env.example
- app/jobs/page.tsx
- tests/features/onboarding-page.test.tsx (retira expectativa do placeholder)
- docs/CODEX_HANDOFF.md

Generated client ignorado no Git foi regenerado. Sem alteração de lockfile/dependências, APIs Resume/Profile/Preferences/Auth ou collector Arbeitnow.

## Testes/resultados

- Focados: 120 testes em 10 arquivos, incluindo nova API externa com mocks, Brasil/local/remote explícito/worldwide/desconhecido/estrangeiro, scores forte/parcial/fraco, token boundary, pipeline fallback/replay, auth/USER/ADMIN/forged query, escaping/loading/erro/vazio/incompleto.
- PostgreSQL opt-in: 4 novos testes passaram em schema local isolado, depois removido. Elegibilidade, upsert/replay/owners, ordenação/fonte ativa, advisory lock/liberação. Suíte completa também executou os 16 testes PG anteriores.
- Suíte completa: **357 testes / 34 arquivos passaram**, sem skips, incluindo PostgreSQL e B2 existente. Primeira execução teve somente 3 falhas B2 EACCES do sandbox; repetição autorizada passou.
- Prisma generate 7.10.0 e migrate deploy passaram.
- `pnpm exec tsc --noEmit --incremental false`: passou após build. Uma tentativa paralela ao build leu tipos .next em regeneração; rerun sequencial passou.
- `pnpm lint`, `pnpm build`, `git diff --check`: passaram. Build confirmou /jobs, /api/jobs e endpoint interno dinâmicos. Warnings CRLF do Git não indicam erro de whitespace.
- Coleta real/replay e contagem brasileira passaram conforme tabela. Sem deploy ou smoke interativo em navegador.

Comandos (raiz, executável pnpm.cmd nesta sessão):
```powershell
pnpm db:generate
pnpm db:migrate:deploy
pnpm exec vitest run tests/domain/jobs tests/application/jobs tests/infrastructure/jobs tests/app/api/jobs.test.ts tests/features/jobs-page.test.tsx tests/features/onboarding-page.test.tsx
$env:JOBCOPILOT_DB_TESTS='1'
pnpm exec vitest run tests/integration/job-matching.test.ts
pnpm test
pnpm jobs:run
pnpm jobs:run
pnpm build
pnpm exec tsc --noEmit --incremental false
pnpm lint
git diff --check
```

## Checklist obrigatório de segurança

| Item | Resultado |
| --- | --- |
| Trust boundary | Sessão → owner de leitura; segredo operacional → pipeline; feed é dado externo. |
| Inputs | Cookie/query/header/JSON externo e envs server-side; sem URL de usuário para fetch. |
| Validação | Zod4/PT-BR, bytes/cardinalidade/strings/datas/URL, gate geográfico explícito. |
| Ownership | Query de JobMatch sempre userId da sessão; upsert usa owner da enumeração server-side. |
| IDOR | USER/ADMIN/cross-user e query forjada testados; DTO não contém IDs internos. |
| Secrets | Fonte sem key; segredo cron/DB exclusivamente server-side; env.example vazio. |
| Browser | Recebe somente próprias recomendações; API no-store e página dinâmica. |
| Logs | Eventos/contagens/códigos/mensagens escolhidos; sem perfil, email, cookies, tokens ou exceptions raw. |
| Externas | Somente fontes fixas HTTPS; URLs de anúncios não são fetched. |
| Timeout | 15s por tentativa/stream; conexão DB 5s/statement 15s em pipeline; host precisa suportar execução. |
| Limites | 4 MiB/1000 postings, lotes jobs100/users50, feed20, páginas1000. |
| SSRF | Endpoint constante, redirect:error, links HTTPS validados; sem fetch arbitrário. |
| XSS | Textos escapados, sem dangerouslySetInnerHTML/execução. |
| Mass assignment | Mapping explícito de jobs/matches; roles/identidade de cliente não são persistidas. |
| Concorrência | Constraints existentes + upsert + lock PostgreSQL compartilhado dedicado. |
| Idempotência | Replay real insere zero; replay PG mantém uma row por owner/job. |
| Internals | 401/409/429/503/500 controlados; endpoint interno não retorna contagens. |
| Negativos | Mock HTTP/schema/limites/deadline/URLs, auth, logs/PII e gate rejeitado. |
| Cross-user | USER A e ADMIN só leem/alteram próprios matches; B permanece intacto em PG. |
| ADMIN | Fluxo normal da sessão; nenhum privilégio para disparar pipeline sem secret operacional. |

## Dívidas / limites

- Scheduler não ativado: definir plataforma, configurar secret/cron diário, monitorar duração/resultado e smoke em produção. Não apresentar preparação como automação já ativa.
- Cobertura principal de um empregador de tecnologia; Adzuna Brasil depende de chave/plano/termos adequados. Não há descoberta de boards/múltiplas fontes brasileiras.
- Matching lexical não entende sinônimos, idiomas, negação ou exigência versus menção. DesiredSkills substitui Profile.skills se preenchido; interesses não demonstram domínio. Pesos precisam de validação real.
- Localizações reconhecidas são conservadoras, sem catálogo completo de municípios/UFs, geocoding ou verificação de residência. Unknown fica fora. Metadata do provider é evidência, não garantia contratual de elegibilidade.
- Duplicadas preservam conteúdo antigo, sem expiração/atualização de vagas. Ausência no feed não apaga Job. Matches de fonte desativada ficam persistidos mas ocultos.
- Matching pagina DB, porém custo total é proporcional a usuários × jobs e upserts são individuais. Sem SLA/global deadline/checkpoint; host pode encerrar operação. Replay recupera sem duplicação; scheduler precisa de runtime compatível. Não foram introduzidos workers.
- Lock necessita sessão PostgreSQL direta. Cooldown HTTP não coordena instâncias; acesso ao secret permanece privilégio operacional.
- Paginação por offset pode mudar durante atualização de score; limite de 1000 páginas e validação pós-query podem produzir página com menos itens. Critérios legados inválidos são omitidos na leitura.
- HTTP/UI autenticadas testadas sem navegador interativo; nenhum usuário local elegível disponível para matching real end-to-end. Login/registro UX, feedback, hardening geral e deploy seguem fases próprias.
- Reportes de fonte que falha após algum lote não quantificam inserções parciais; replay é seguro e logs indicam falha. Não há histórico persistente de execuções.
- Antes de feedback, decidir retenção para JobMatch que se torna inelegível: remoção atual implica cascade do feedback existente.

Nenhum enrichment por LLM ou feedback iniciado.
