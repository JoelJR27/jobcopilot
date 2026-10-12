# Onboarding mínimo + primeira coleta real + persistência/dedupe

Data: 2026-10-07. Escopo explicitamente autorizado: onboarding, uma fonte real e normalização/persistência/idempotência. Sem matching, enrichment, scheduler, admin, realtime, Redis/BullMQ ou novas entidades. Implementações anteriores foram preservadas.

## Inspeção

Os sete documentos solicitados foram lidos integralmente. Foram conferidos JobSource/Job, índices, relações, ports, repositories, composição, auth guards, schemas Profile/Preferences, páginas e testes atuais.

O banco já fornece JobSource.name único, JobSource.active, `Job.source` com onDelete Restrict, `@@unique([sourceId, externalId])` e `@@unique([sourceId, normalizedUrl])`. Não foi necessário alterar schema, migrations ou índices.

## Fonte escolhida

**Arbeitnow**, endpoint público JSON fixo `https://www.arbeitnow.com/api/job-board-api`.

Justificativa: [documentação oficial](https://www.arbeitnow.com/blog/job-board-api) descreve API gratuita sem chave, estruturada, alimentada por ATS e disponível desde 2021. Não demanda conta, cartão, scraping HTML ou serviço pago. Os [termos específicos da API](https://www.arbeitnow.com/terms) pedem backlink à Arbeitnow; a atribuição foi incluída em onboarding e no destino mínimo `/jobs`.

A API cobre sobretudo Europa. O feed verificado continha 325 registros, cerca de 2,5 MiB e links da mesma Arbeitnow nos domínios .com/.co.uk/.fr/.ch. Esses hosts regionais pertencem à única fonte lógica/API coletada; não foram adicionados collectors/fontes independentes. Duas fontes apenas sintéticas são usadas para testar isolamento de constraints.

Não foram escolhidas APIs pagas nem integrações que exijam scraping agressivo. A Remotive pública foi descartada porque seus [termos da API](https://remotive.com/remote-jobs/api) restringem o uso de listings condicionado à coleta de signups/emails, incompatível com o fluxo autenticado planejado.

## A — onboarding

Página `/onboarding` explicitamente dinâmica e autenticada server-side. `GetOnboardingProgress` usa o ResumeRepository existente e os casos de uso GetProfile/GetPreferences, sempre com userId da sessão. A saída contém somente account/resume/profile/preferences/ready, nunca filenames, storageKey, email, IDs ou conteúdo profissional.

- Conta: autenticada.
- Currículo: existe row atual pertencente ao usuário; conclusão significa upload persistido, não extração/processamento automático.
- Perfil/preferências: atendem aos schemas mínimos já estabelecidos.
- Ready: as três etapas acima concluídas.

Sem currículo, a página oferece um formulário simples que envia file para o POST `/api/resumes` existente, com feedback/loading/erro, limite client de 5 MiB e timeout client de 45s. O backend continua sendo autoridade para identidade, tipo, assinatura e tamanho. Upload bem-sucedido atualiza o progresso via router.refresh. Resume/Auth não foram reimplementados.

Há links `/profile` e `/preferences`. O link `/jobs` só aparece quando ready=true. Um destino autenticado mínimo foi criado para evitar 404: ele informa que recomendações pertencem à próxima etapa, sem consultar ou exibir lista/score/matches. Não é a tela de recomendações prevista posteriormente.

Erros de carregamento/auth usam mensagens e logs fixos. A renderização JSX fica fora do try de leitura, conforme lint React. Não há wizard, novo estado persistido de onboarding ou infraestrutura.

## B — collector

Port mínimo `JobCollector.collect(): Promise<CollectedJob[]>`, com externalId/url/title/company/description/location/workModel/publishedAt. O adapter Arbeitnow mapeia slug → externalId, company_name → company, created_at → publishedAt. remote=true mapeia REMOTE; false permanece desconhecido, pois não distingue presencial de híbrido.

Defesas:

- Endpoint constante e preconfigurado, não recebido por URL/body/env de usuário nem lido de JobSource.baseUrl para fetch.
- Fetch HTTPS sem cookies/Authorization, User-Agent JobCopilot/0.1, cache no-store e redirect:error (zero redirects).
- Deadline explícito de **15 segundos por tentativa**, com AbortController e Promise.race cobrindo conexão e stream.
- **No máximo 2 tentativas**, com backoff fixo de 750ms. Retry só em network/timeout/5xx sem Retry-After. 429 ou Retry-After não provocam retry imediato.
- Status 200 e application/json obrigatórios; schema Zod/PT-BR; nenhum payload raw em logs/exceptions.
- Response limitada a **4 MiB de bytes efetivamente lidos**, incluindo quando Content-Length é ausente/forjado. Reader cancelado e request abortada na conclusão/falha.
- Até **1000 vagas** por feed. Slug até 512 caracteres; URL 2048; title/company/location 500; description 100000; datas entre 1970 e 2100.
- Links next/paginação fornecidos pela resposta são ignorados. Nenhuma URL de vaga é buscada no servidor. Hosts de links de vagas têm allowlist dos quatro domínios Arbeitnow observados.
- Sem shell, execução, parsing/renderização HTML ou ação baseada em descrições.

Descrições podem conter HTML literal. Ele é normalizado como string não confiável, não sanitizado para uso como HTML. Qualquer UI futura deve renderizar texto escapado; nenhum dangerouslySetInnerHTML foi introduzido.

## C — normalização e persistência

Normalização de texto: Unicode NFKC, remoção de controles ASCII, espaços consolidados e trim. Campo inválido ou maior que limites falha antes de qualquer inserção de Job. Nenhum valor arbitrário é convertido em comando/SQL/config.

URL determinística:

- HTTPS somente, sem credenciais embutidas, portas não padrão, IP literals, localhost ou sufixos locais/internos.
- Canonicalização do host e porta padrão pelo parser URL.
- Fragment removido; utm_*, gclid/fbclid/msclkid removidos.
- Query ordenada, preservando parâmetros funcionais/repetidos; case do path preservado.
- Barra terminal não raiz removida; raiz permanece `/`.

Original url é guardada separadamente de normalizedUrl para o backlink à vaga. A normalização é testada para determinismo/idempotência e não deve ser tratada como equivalência universal de URLs de qualquer provider futuro.

`CollectJobs` garante source por name (sem reativar active=false), chama o único collector, normaliza/valida o feed e insere lotes de até 100. Sem transação aberta durante HTTP.

Repository usa `createMany(..., skipDuplicates: true)`: PostgreSQL e as duas constraints são a defesa final, inclusive em concorrência. Com externalId, a chave sourceId+externalId detecta replay/URL alterada; sem externalId, sourceId+normalizedUrl detecta replay/tracking alterado. A constraint de URL também impede dois IDs externos diferentes para a mesma URL na mesma fonte. Duplicadas são contadas explicitamente, não descartadas sem observabilidade.

Não há find-all/comparação do dataset do DB, exclusão por ausência na coleta nem cascade ao remover fonte. Duplicadas são **ignoradas**, não atualizadas; title/description/url previamente persistidos permanecem inalterados. JobSource/Job são dados globais de fontes, sem owner usuário; collector não recebe nem usa perfis privados.

## Execução real

Comando manual na raiz:

```powershell
pnpm jobs:collect
```

Usa Node 24 diretamente, sem runner/dependência adicional. CLI valida DATABASE_URL, usa conexão com timeout 5s e statement_timeout 15s, desconecta no finally e registra somente fonte/contagens/códigos estáticos. Não há endpoint HTTP de disparo, scheduler ou pipeline de matching.

Execução contra o **banco local configurado da aplicação**, preservando tabelas privadas:

| Execução real | Coletadas | Inseridas | Duplicadas |
| --- | ---: | ---: | ---: |
| Primeira | 325 | 325 | 0 |
| Segunda | 325 | 0 | 325 |

JobSource Arbeitnow e as 325 vagas reais permanecem intencionalmente no banco da aplicação. Não foram alterados User/Session/Resume/Profile/Preference. A primeira tentativa de rede no sandbox foi bloqueada; execução autorizada fora do sandbox passou, com erro/log anterior sanitizado.

## Arquivos desta entrega

Criados:

- `shared/config/job-source.ts`
- `shared/errors/job-collection-error.ts`
- `domain/jobs/collected-job.ts`
- `domain/jobs/normalize-job.ts`
- `application/jobs/ports/job-collector.ts`
- `application/jobs/ports/job-repository.ts`
- `application/jobs/ports/job-source-repository.ts`
- `application/jobs/collect-jobs.ts`
- `infrastructure/jobs/arbeitnow-job-collector.ts`
- `infrastructure/database/prisma/repositories/job-repository.ts`
- `infrastructure/database/prisma/repositories/job-source-repository.ts`
- `infrastructure/composition/job-collection.ts`
- `scripts/collect-jobs.ts`
- `application/onboarding/get-onboarding-progress.ts`
- `infrastructure/composition/onboarding.ts`
- `features/onboarding/resume-step.tsx`
- `app/onboarding/page.tsx`
- `app/onboarding/loading.tsx`
- `app/jobs/page.tsx`
- `tests/fixtures/collected-jobs.ts`
- `tests/domain/jobs/normalize-job.test.ts`
- `tests/application/jobs/collect-jobs.test.ts`
- `tests/application/jobs/collection-cli.test.ts`
- `tests/application/onboarding/get-onboarding-progress.test.ts`
- `tests/infrastructure/jobs/arbeitnow-job-collector.test.ts`
- `tests/infrastructure/database/job-repositories.test.ts`
- `tests/features/onboarding-page.test.tsx`
- `tests/integration/job-collection.test.ts`
- `docs/PHASE_4_REPORT.md`

Atualizados: `package.json` (somente jobs:collect), `docs/CODEX_HANDOFF.md`. Lockfile, dependências, schema, migrations e implementações anteriores não foram alterados nesta etapa. Mudanças pré-existentes permanecem no working tree.

## Testes/resultados

Na raiz (executável pnpm.cmd na sessão PowerShell):

```powershell
pnpm exec vitest run tests/domain/jobs tests/application/jobs tests/application/onboarding tests/infrastructure/jobs tests/infrastructure/database/job-repositories.test.ts tests/features/onboarding-page.test.tsx
$env:JOBCOPILOT_DB_TESTS = '1'
pnpm exec vitest run tests/integration/job-collection.test.ts
pnpm test
Remove-Item Env:JOBCOPILOT_DB_TESTS
pnpm exec tsc --noEmit --incremental false
pnpm lint
pnpm build
git diff --check
```

- **65 testes focados passaram**: onboarding auth/completo/incompleto/privacidade, fonte válida, erros HTTP, payloads/Content-Type/JSON, deadlines request/body, limites de bytes/itens, retry, URLs fixas/allowlist/unsafe/SSRF, normalização, batching/counters, CLI Node e logs controlados.
- **9 integrações PostgreSQL passaram** em schema local temporário removido ao final: dedupe externalId, fallback URL/NULL, conflito de IDs na mesma URL, duas fontes sintéticas sem colisão, repetição idempotente/coleta vazia, concorrência, onDelete Restrict, active=false e HTML como texto.
- **Suíte completa: 291 testes / 28 arquivos passaram**, incluindo integrações PostgreSQL/B2 das fases anteriores, sem skips.
- **Typecheck, lint completo, build e diff-check passaram.** O lint inicial exigiu mover JSX fora do try de leitura no onboarding; após correção, os 5 testes de página afetados, typecheck, lint e build foram repetidos e passaram. Build confirmou `/onboarding` e `/jobs` dinâmicos. Nenhum deploy foi realizado.
- Coleta real e repetição foram verificadas pelos contadores acima, sem exibir body/descriptions/tokens.

## Checklist de segurança

| Item | Situação |
| --- | --- |
| Trust boundary | Onboarding usa sessão; feed é externo/untrusted e validado antes de persistir. |
| Inputs / validação | JSON feed limitado + schema; links allowlisted; descrições são strings, não ações. |
| Ownership / IDOR | Progresso só do user.id autenticado; saída só booleans; collector não acessa dados privados. |
| Secrets / browser | Fonte não tem key; env DB server-only; sem novas envs NEXT_PUBLIC; sem IDs/storageKey no onboarding. |
| Logs / erros | Contagens/códigos fixos e mensagens genéricas; sem body, cookies, creds, exception raw. |
| Integrações / timeout | Endpoint fixo, zero redirect, timeout request/body 15s, máximo 1 retry; DB CLI limitado. |
| Limites | 4 MiB response, 1000 jobs, campos limitados, batches 100; client upload 5 MiB mantendo backend anterior. |
| SSRF | Não recebe URL do usuário, não busca job URLs/links next, endpoint/domínios previamente configurados. |
| XSS / comandos | Sem HTML raw, eval, shell ou execução. Strings externas guardadas como dados. |
| Mass assignment / SQL | Mapping explícito; sourceId da composição/source repository; Prisma query builder e constraints. |
| Corridas / replay | INSERT ON CONFLICT e unique constraints; teste concorrente e replay real sem duplicação. |
| Negativos / cross-user | Auth, progresso incompleto, resource de B não conta para A, feed inválido, unsafe links, timeout e erros sanitizados. |
| ADMIN | Mesmo onboarding/autenticação normal; nenhuma nova rota admin/impersonation/trigger HTTP. |

Busca de padrões de secrets nos novos arquivos não encontrou segredo potencialmente real. Fixtures são sintéticos; nenhuma credencial foi hardcoded. Isso não substitui auditoria completa no deploy.

## Dívidas e limites

- Cobertura principalmente europeia/idiomas não PT-BR: avaliar relevância antes de expandir fontes. Remote não implica disponibilidade mundial; created_at é timestamp fornecido pelo agregador, não garantia de publicação original.
- Provider não oferece SLA; termos/endpoint/schema/cobertura podem mudar. Fail-closed se >4 MiB/1000 jobs ou schema inválido. Links de paginação são ignorados; não há garantia de histórico completo.
- Descrição HTML permanece texto não confiável. Antes da tela real ou de enrichment, preservar escape/validação e decidir conversão de markup para texto profissional; nunca inserir HTML raw.
- Ignore-duplicates preserva conteúdo antigo: alterações de title/description/url da fonte não atualizam rows existentes. Expiração/remoção de vaga não foi modelada e ausência na coleta não exclui.
- Barra terminal removida é política inicial de normalização; pode não representar equivalência em outro provider. Reavaliar explicitamente antes de adicionar fonte futura.
- Coleta não é uma transação global: falha DB num lote deixa lotes anteriores inseridos; replay seguro finaliza sem duplicar. Não há lock de pipeline ou scheduler; operador executa manualmente e deve evitar polling excessivo.
- `/jobs` é placeholder autenticado, sem recomendações/ranking/listagem. Matching/enrichment são próximos trabalhos, não realizados.
- Smoke interativo do upload/progresso em navegador não foi automatizado; guards/renderização SSR, API anterior e use cases são testados separadamente. Profile/Preferences podem exigir recarga do onboarding após salvar/voltar pelo navegador.
- UI de login e gates gerais de produção permanecem conforme roadmap. Migrations anteriores precisam estar aplicadas no banco de runtime; nenhuma migration de Auth foi reaberta/aplicada nesta entrega.

Matching não iniciado.
