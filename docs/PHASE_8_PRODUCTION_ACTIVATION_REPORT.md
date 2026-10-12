# Fase 8 — ativação de produção

Data: 2026-10-08. Status: **ATIVAÇÃO BLOQUEADA; BACKEND PRODUCTION READY NÃO DECLARADO**.

Não houve nova feature, alteração de arquitetura, migrations em produção, seed, deploy ou execução de GC. Alterações desta fase no working tree: este relatório, BACKEND_PRODUCTION_CHECKLIST.md e `.gitignore` (relatório local `.vitest/`). Alterações de fases anteriores continuam presentes e não foram descartadas nem publicadas como release.

## Ambiente e configuração remota

Projeto Vercel JobCopilot vinculado pela CLI autenticada no ambiente do operador. Domínio reservado: https://jobcopilot-zeta.vercel.app. Não há deployment Production verificado; esse endereço não representa smoke HTTPS concluído.

Configuração remota confirmada: Next.js, Node 24, Build Command `pnpm build`, install `pnpm install --frozen-lockfile && pnpm db:generate`. `ENABLE_EXPERIMENTAL_COREPACK=1` em Production para respeitar pnpm 11.13.1. Não se usou `next build` diretamente. Plano identificado Hobby; adequação do uso pessoal/não comercial, região e integração Git ainda precisam de confirmação.

Configuradas exclusivamente em Production: DATABASE_URL, DIRECT_DATABASE_URL, APP_URL, RATE_LIMIT_MODE, RATE_LIMIT_KEY_SECRET, CRON_SECRET, INTERNAL_JOBS_SECRET, B2_ENDPOINT, B2_REGION, B2_KEY_ID, B2_KEY_NAME, B2_APPLICATION_KEY, B2_BUCKET_NAME e flag COREPACK. Secrets têm tipo sensitive; listagem confirmou targets Production e ausência de SEED_ADMIN. Nenhum valor foi escrito no repositório, chat ou logs de diagnóstico.

## PostgreSQL, backup, migrations e seed

Destino Neon informado pelo operador via DATABASE_URL_PRODUCTION. Conexões pooled e direct foram verificadas somente com leituras: transporte TLS 1.3 autorizado, certificado validado. A conexão direta remove o sufixo pooler do host; ambas as configurações enviadas à Vercel exigem verify-full. Não foi desabilitada a verificação TLS.

Destino vazio: zero tabelas públicas, nenhuma tabela de migrations. Portanto **0 de 5 migrations aplicadas**. Limite informado pelo servidor: 901 conexões; observadas 12 no instante da consulta, sem equivalência a um orçamento garantido. Pool da aplicação continua 2 por instância, além das conexões diretas de locks. Privilégios mínimos de usuário runtime/migrator e orçamento de concorrência final ainda pendentes.

Operador confirmou: banco vazio e sem backup. Não há evidência de retenção ≥7 dias, RPO≤24h ou restore isolado testado. O checklist não contém exceção para banco vazio; migrations permanecem bloqueadas. Não foi contratada solução paga nem presumida cobertura de backup pelo plano Neon.

Após atender backup/restore, executar no ambiente seguro usando conexão direta: `pnpm exec prisma migrate deploy --config prisma7.config.ts` e `pnpm exec prisma migrate status --config prisma7.config.ts`. Confirmar as cinco migrations, incluindo backend_readiness. Nunca migrate dev/reset/db push em produção. Seed ADMIN ainda não executado; usar bootstrap manual, conferir role e remover envs de seed, sem publicar senha.

## B2

A verificação encontrou a credencial então configurada sem restrição de bucket. O operador autorizou explicitamente criar uma key nova restrita e armazená-la somente em Vercel Production, sem revogar a anterior.

Metadados confirmam duas keys criadas com nome jobcopilot-production, restritas a um bucket, com somente listBuckets/readBuckets/listFiles/readFiles/writeFiles/deleteFiles. A primeira tentativa falhou no envio em lote à API Vercel (Invalid JSON); sua key ficou sem uso. A segunda foi armazenada por requisições individuais. Não houve revogação automática. O operador deve identificar e revogar a key sem uso e revisar a antiga credencial ampla em procedimento separado autorizado.

O bucket configurado é privado pelos metadados nativos. A verificação imediata de autorização da nova credencial não terminou com sucesso; **não afirmar CRUD/version validado com essa key**. O gate de env final também não foi executado após essa falha. Não há credenciais novas disponíveis em arquivo local; os valores estão somente em envs sensitive de Production.

Quatro testes B2 sintéticos passaram na suite local com a credencial anterior; isso não valida a credencial nova de produção. Permanecem: upload/get/delete/listVersions/deleteVersion sintéticos com a key Production, ACL/anon access final e verificação read-only de candidatos GC. Como o Neon está vazio, confirmar se o bucket contém objetos referenciados somente por banco de desenvolvimento antes de qualquer GC; não apagar currículos reais nem supor que bucket compartilhado é seguro.

## Gates locais e exposição

Passaram: `pnpm db:generate`, Prisma validate, `pnpm test` (436 passou, zero falhas/skips, PostgreSQL exclusivamente local em schemas isolados; providers com mocks; B2 sintético), `pnpm exec tsc --noEmit --incremental false`, `pnpm lint`, `pnpm build`, `pnpm backend:exposure`, scanner de secrets e `git diff --check`.

Audit prod exit 1 permaneceu exclusivamente nos três advisories documentados: deepmerge-ts GHSA-ggr8-5vv4-36mx (alto); mysql2 GHSA-3f6p-5ww8-9rcr (alto) e GHSA-rgwj-5xj2-c3m3 (moderado). Nenhum crítico. Exposição local: 22 traces, 551 arquivos distintos, 1750 arquivos standalone; nenhum pacote vulnerável documentado, env ou valor secreto incorporado identificado. Build removeu uma env copiada para standalone. Artefato real Vercel ainda não existe para inspeção; não extrapolar esse resultado local.

Scanner: working tree e três commits recentes, nenhum possível segredo encontrado. `.env` ignorada e nenhuma env versionada. `.next`, generated Prisma, `.vercel`, node_modules, tsbuildinfo e relatório `.vitest/` não devem ser incluídos no commit. Há muitas alterações/untracked de fases anteriores; release revisada/commit e vínculo Git ainda pendentes.

## Status dos passos de ativação

| Passos | Evidência / pendência |
| --- | --- |
| 1 Repositório | Status, scripts, vercel.json, scanner e ignores revisados; release não publicada |
| 2 Credenciais | Key restrita criada/armazenada; verificar uso, limpar key sem uso e revisar antiga ampla |
| 3 PostgreSQL | Neon pooled/direct TLS verificado; privilégio/orçamento final pendentes |
| 4 Backup | BLOQUEANTE: não configurado, retenção/restore não verificados |
| 5 Vercel env | Targets Production e nomes verificados; seed ausente |
| 6 Env gate | PENDENTE com configuração final/nova key; não alegar exit 0 |
| 7 Gates locais | Passaram; audit aceito exatamente pelos três CLI documentados |
| 8 Migrations | Não executadas; 0/5 no destino vazio |
| 9 Seed | Não executado |
| 10 Deploy | Projeto/config preparados; nenhum Production deployment |
| 11 Artefato remoto | Não disponível; inspeção local não o substitui |
| 12 Smoke HTTPS | Não executado; contas sintéticas Production não criadas |
| 13 B2 Production | Metadados privados/restritos; operações com nova key pendentes |
| 14 Jobs cron | Preparado GET /api/internal/jobs/run, 0 6 * * *; não ativo |
| 15 GC cron | Preparado GET /api/internal/resumes/gc, 0 7 * * *; não ativo/executado |
| 16 Job data | Fontes/lifecycle locais existentes; produção sem tabelas/dados |
| 17 Rate limit | postgres configurado; 429/Retry-After/503 via HTTPS Production pendentes |
| 18 Crons dashboard | Não verificados; não registrar active in production |
| 19 Observabilidade | Eventos locais sanitizados; logs Production não disponíveis |
| 20 Relatório | Relatório e checklist atualizados somente com evidências reais |

Crons usam Bearer CRON_SECRET, igual a INTERNAL_JOBS_SECRET, sem query string. MaxDuration/deadlines e funcionamento real na Vercel ainda precisam ser verificados. Não acionar GC antes de validar associação DB/bucket e candidatos, nem registrar cron ativo sem execuções reais e inspeção no dashboard.

## Próxima ação operacional

Atender backup/restore e revisar segurança do bucket vazio/compartilhado; verificar nova key e gate final; depois migrations/seed/deploy, artefato, smoke sintético, jobs/GC e rate limiting em HTTPS. A pergunta sobre backup permanece pendente com o operador. Não há autorização para ignorar esse requisito, fazer restore destrutivo ou revogar keys.

Congelar features de backend nesta fase. Não avançar para frontend, LLM ou auto-apply. A condição BACKEND PRODUCTION READY ainda não foi atingida.
