# Fase 8 — release do backend

**2026-10-12 — alpha pessoal/não comercial.** Ambiente verificado: [Production HTTPS](https://jobcopilot-zeta.vercel.app). Release Git validado: `jobcopilot-rep1cporu-joel-junior.vercel.app`, snapshot `c01dd1b79230bbd853b970f9dc2ee3023bd64158`. Este documento substitui o estado operacional dos relatórios de 8 de outubro; preserva-os como histórico.

Nenhuma feature nova, frontend, domínio, matching ou collector foi implementado. Única correção HTTP: bug real do teto de payload da Vercel, com autorização explícita para cap de 4 MiB no adapter, preservando domínio de 5 MiB e compensação B2/DB. Operações, documentação e testes de ativação foram completados.

## Backup/restore e incidente de RPO

Neon Free foi confirmado com **6h de PITR**. Complemento real: `pg_dump` custom-format em GitHub Actions/Ubuntu 24.04/Node 24, conexão direta com `verify-full`, credenciais somente em env, imagem PostgreSQL 18 fixada por digest; AES-256-GCM e SHA-256, dump em memória limitada, bucket B2 **privado e separado** dos currículos. Key exclusiva restrita ao bucket/prefixo; oito secrets somente no Environment `database-backup`, permitido em `main`. Sem notebook/browser como scheduler.

Arquivos datados e versões retidos por **mais de sete dias completos**, exclusão versionada somente de nomes/idades conhecidos; desconhecidos não autorizam delete. Limites: 64 MiB/dump, 768 MiB no bucket e inventário de 1.000 versões. GitHub runner padrão em repo público é gratuito; B2 primeiros 10 GB **por conta**, compartilhados, não ilimitados. Operador confirmou caps de storage/download/transações **US$0**. Nenhum plano pago contratado. Termos/quota e operação em [BACKUP_SETUP.md](BACKUP_SETUP.md).

Backups automáticos diários reais: runs 37927035876 (09/10), 38047724315 (10/10), 38135674981 (11/10), 38254658914 (12/10), todos success. **Houve violação real do alvo RPO: intervalo de 25h49 entre os dois últimos.** Não foi omitida nem descrita como sucesso de RPO. Operador autorizou trocar o disparo diário por watchdog **`23 * * * *`**, que renova quando snapshot verificado chega a **23h**. Manifesto HMAC vincula timestamp/checksum/versão exata; replay recente evita dump e download completo.

Cadência horária publicada no workflow ativo; verificação real no runner:

| Evidência | Resultado |
| --- | --- |
| [Backup/restore 38269261370](https://github.com/JoelJR27/jobcopilot/actions/runs/38269261370) | Recuperação/decrypt/checksum/restore isolado aprovados; 13 tabelas, 5 migrations, schema/índices/contagens iguais; branch descartável removida |
| Backup desse run | 2.765.147 bytes; 69.269ms; checksum parcial d311f153d8f4; snapshot fresco, zero removidos |
| [Replay 38269619596](https://github.com/JoelJR27/jobcopilot/actions/runs/38269619596) | database_backup_fresh, 1.270ms, sem nova cópia |
| Primeiras tentativas | Falha sanitizada 3F000: public ausente em branch descartável; preparação IF EXISTS corrigida só no alvo isolado |

**RPO≤24h é o alvo operacional monitorado, não SLA.** GitHub pode atrasar/descartar eventos; best-effort foi explicitamente informado e aceito na autorização do watchdog. O primeiro evento `schedule` da nova cadência ainda não foi observado nesta sessão; dispatch não é chamado de execução automática. O workflow anterior já executou automaticamente em quatro dias, e a configuração horária/renovação/replay foram comprovados. Acompanhar o próximo schedule e idade do snapshot; falha/idade≥24h é incidente. Sete dias de política foram testados; ainda não existiam sete dias de arquivos reais para comprovar rotação antiga. Não restauramos Production.

## Banco, seed e credenciais

- Backup inicial/restore passaram **antes** de aplicar migrations; `migrate deploy` exit0 e `migrate status` exit0. Revalidado agora: **5/5**, schema up-to-date. Sem migrate dev/reset/db push.
- Neon remoto: socket cliente TLSv1.3, encrypted/authorized=true, certificado validado. `pg_stat_ssl` pode indicar false no PostgreSQL atrás do proxy e não representa ausência de TLS no cliente.
- Runtime role separada com DML nas tabelas necessárias, sem superuser/createdb/createrole/bypassrls/schema CREATE/migrations UPDATE. DATABASE_URL pooled, DIRECT_DATABASE_URL direta/session do mesmo banco para locks. Operador/migrations/backup usam credencial separada; pool2 e timeouts revisados.
- Bootstrap ADMIN manual executado, role confirmada; SEED_ADMIN_* ausentes no runtime Production. Não houve registro de senha/hash nem edição de contas privadas para smoke.
- Nova key B2 Production validada com upload/get/delete/listVersions/deleteVersion sintéticos, ACL privada e anonymous negado; bucket permanece privado. Key de backup independente. Nenhum currículo real tocado.
- **Manter:** key Production validada e key exclusiva do backup. **Revisar para revogação manual:** duas keys antigas de tentativa Production e key ampla local após mapear dependências dev/test/operador. Operador decidiu manter/revisar manualmente; nenhuma key revogada, nenhum ID/valor reproduzido.

## Deployment e exposição

Snapshot do backend existente foi publicado no repositório vinculado sem reset/merge/commit local, preservando alterações do working tree. Isso corrigiu o risco de o Git remoto ainda conter backend incompleto. Deploy CLI e deploy Git passaram; Production HTTPS saudável, Node24/pnpm11.13.1/gru1/Fluid Compute.

Build Command real: `pnpm backend:env && pnpm build && pnpm backend:exposure`. Env gate remoto exit0, valid=true/invalidFields vazio; finalize-build executado. 14 envs somente Production, RATE_LIMIT_MODE=postgres, nenhum NEXT_PUBLIC/SEED_ADMIN.

Manifests/standalone **gerados no build remoto Vercel**: 22 traces, 551 paths, 1.637 arquivos; zero lodash/deepmerge-ts/mysql2/fast-uri, arquivos env ou secrets embutidos. Build local também passou. API de files indisponível no deployment Git; ZIP final das lambdas não baixado. Não alegamos inspeção do ZIP nem equivalência perfeita ao build local; a evidência usa os manifests/artefato reais gerados na Vercel e metadados do deployment, além da inspeção acessível do deployment CLI anterior. [Exposição atualizada](DEPENDENCY_EXPOSURE_REPORT.md).

## Smoke e operação real

`scripts/production-smoke.mjs`: **passou no release Git via HTTPS**, 3.939 assertions (incluem verificações recursivas de DTO; não são 3.939 cenários independentes). USER A/USER B/ADMIN sintéticos: cadastro/login/logout/me, PDF/DOCX, Profile/Preferences, onboarding/jobs, feedback/upsert, admin/métricas/toggle. USER→admin403, ownership próprio, userId forjado não controla acesso, cross-user bloqueado, ADMIN→feedback de terceiro404, cron sem auth401. Cookies seguros/no-store/origin403 e nenhuma exposição de campos internos. Fixtures B2/DB removidas por prefixos/IDs/emails sintéticos exatos; contas reais preservadas.

Bug Vercel confirmado anteriormente: PDF sintético 4,75 MiB resultou413 antes do handler, apesar do domínio5 MiB. Com cap autorizado VERCEL=1: **4 MiB201 / 4 MiB+1=400**, sem mudar domínio/compensação. Requests acima do limite da plataforma ainda podem receber413 antes do código.

Limiter PostgreSQL real: duas sessões compartilham429/Retry-After, nove respostas limitadas no ciclo de teste e buckets confirmados. Servidor Production isolado com DB inacessível:503/no-store/genérico/sem fallback local; banco Production não desligado. Lock de jobs ocupado:409 real, sem executar coleta concorrente.

Jobs/GC Vercel **registrados e ativos**, respectivamente GET `0 6 * * *` e `0 7 * * *`. Operador usou Run no dashboard para ambos; completed bem-sucedidos provaram Bearer automático. Replays HTTPS protegidos passaram. Jobs300s/deadline240s,GC60s/deadline45s, locks independentes. Não são somente adapters preparados.

Último smoke: **1.723 jobs históricos**, CI&T228/Swile33/Arbeitnow1462, separados por JobSource. Replay não cria duplicadas; Brasil-first/active/lastSeenAt/lifecycle mantidos; nenhum delete de histórico inesperado. Contagem histórica não significa total elegível brasileiro nem número de vagas abertas verificadas.

Logs reais no novo release: pipeline criou630 matches dos três usuários sintéticos e no replay atualizou630/criou0, parcial=false/timedOut=false; duração10.116ms e8.601ms na primeira rodada do novo release. GC dessa rodada:7versões/3referências/0 candidatas antigas, deleted0/skipped7/failed0/partial=false,514ms. Dashboard GC anterior:0 candidatas/deleted0,444ms. Inventário/banco/bucket conferidos antes; janela24h preservada. Fixtures removidas depois do GC. Logs revisados somente com eventos/counters/duração/fontes/códigos sanitizados; sem PII/secrets/conteúdo integral.

## Gates finais

| Gate | Resultado |
| --- | --- |
| pnpm db:generate / Prisma validate | Exit0, Prisma7.10 |
| Prisma migrate deploy/status Production | Exit0,5/5, up-to-date |
| pnpm test | 410 passaram;35 opt-in separados |
| PostgreSQL integration local isolada | 35 passaram/7 suites; total445 testes |
| Typecheck sem incremental / lint | Exit0 |
| pnpm build / backend:exposure | Exit0; finalize-build e artefato sanitizado |
| pnpm audit --prod | Exit1 **exatamente** GHSA-ggr8-5vv4-36mx,GHSA-3f6p-5ww8-9rcr,GHSA-rgwj-5xj2-c3m3;2 altos/1 moderado CLI,0críticos |
| Secret scanner | Working tree e5 commits recentes, inclusive remoto: nenhum achado; .env ignorada |
| git diff --check | Exit0; avisos de CRLF apenas |
| Backend env/build/exposure remotos | Exit0, mesmos três avisos fora dos manifests runtime |
| Backup/restore/replay reais | Success, branch isolada, sem restore Production |
| Smoke HTTPS /429 compartilhado /503 isolado /409lock | Passaram |

## Arquivos desta ativação e fechamento

- Operação: `.github/workflows/database-backup.yml`, `scripts/database-backup.mjs`, `scripts/database-backup-lib.mjs`, `scripts/production-smoke.mjs`, `scripts/check-repository-secrets.mjs`, `.vercelignore`, `vercel.json`, `.gitignore`.
- Bug autorizado/testes: `app/api/resumes/route.ts`, `infrastructure/http/read-resume-form-data.ts`, `tests/app/api/resumes/route.test.ts`, `tests/infrastructure/database-backup.test.ts`.
- Documentação: este relatório, `BACKEND_PRODUCTION_CHECKLIST.md`, `BACKUP_SETUP.md`, `DEPENDENCY_EXPOSURE_REPORT.md`, `DAILY_JOBS_SETUP.md`, `CODEX_HANDOFF.md` e referência histórica no `PHASE_8_FINAL_REPORT.md`.
- Alterações prévias das fases1–7 foram preservadas e publicadas como snapshot validado; não constituem novas features desta fase.

**Blockers de ativação restantes: nenhum no alpha pessoal autorizado.** Obrigações/dívidas não bloqueantes: monitorar idade do backup e primeiro schedule horário, ausência de SLA do GitHub e alerta externo, retenção real ainda não completou sete dias, guarda/acesso aos secrets/cofre e restores periódicos, revisão manual de keys antigas, quotas/conexões, ZIP final das lambdas não acessível por API, email recovery/verification e frontend ainda fora do escopo. Quota/RPO/cron com falha exige ação operacional; READY não é promessa de disponibilidade ou audit universalmente limpo.

Backend/arquitetura/features congelados. Nenhuma feature adicional iniciada; próximo escopo exclusivamente Frontend Production Readiness, mediante nova solicitação.

BACKEND PRODUCTION READY
