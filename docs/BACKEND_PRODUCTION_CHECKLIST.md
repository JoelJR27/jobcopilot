# Checklist autoritativo de produção do backend

Atualizado em **2026-10-12**, alpha **pessoal/não comercial** autorizado no Vercel Hobby. Evidências: [PHASE_8_RELEASE_REPORT.md](PHASE_8_RELEASE_REPORT.md). Relatórios de 8 de outubro são históricos.

## Plataforma, envs e secrets

- [x] Repositório JoelJR27/jobcopilot vinculado; snapshot validado publicado, preservando HEAD/working tree local. Release Git Production READY, Node24/pnpm11.13.1/gru1. HTTPS: https://jobcopilot-zeta.vercel.app.
- [x] Uso pessoal/não comercial confirmado; nenhum serviço/plano pago contratado.
- [x] 14 envs somente Production: DATABASE_URL, DIRECT_DATABASE_URL, APP_URL, RATE_LIMIT_MODE, RATE_LIMIT_KEY_SECRET, CRON_SECRET, INTERNAL_JOBS_SECRET, seis campos B2 e ENABLE_EXPERIMENTAL_COREPACK. RATE_LIMIT_MODE=postgres; nenhum NEXT_PUBLIC nem SEED_ADMIN no runtime.
- [x] Secrets cron iguais e distintos da key do limiter, server-only. Env gate remoto exit0/valid=true, sem flexibilizar validator.
- [x] .env ignorada; .env.example com15 valores vazios; .vercelignore exclui envs/builds/dependências/gerados locais. Scanner working tree e5 commits recentes, incluindo release remoto após fetch: nenhum achado. Sem valores de credentials em Git/logs/argumentos.

## PostgreSQL, backup e storage

- [x] Neon Free/PITR6h real, complementado por backup externo; não descrito como retenção Neon7dias. Conexões pooled runtime e direct/session para locks, mesmo banco; credencial de migrations/backup do operador separada.
- [x] Socket cliente com TLSv1.3/certificado autorizado e rejectUnauthorized:true. pg_stat_ssl atrás do proxy Neon não comprova TLS cliente. Sem bypass de certificado.
- [x] Runtime sem superuser/createdb/createrole/bypassrls/schema CREATE/migrations UPDATE; DML nas tabelas da aplicação. Pool2/instância, connect/statement5s, idle10s e locks diretos separados revisados; reservar conexões administrativas.
- [x] Backup/restore passou **antes** das migrations: cópia inicial vazia e posterior restore13 tabelas/5 migrations. Estratégia final GitHub Actions persistente + bucket B2 privado separado; custom-format/AES-GCM/checksum, arquivos datados/versões retidos >7dias e rotação automática. [Runbook](BACKUP_SETUP.md).
- [x] Backups automáticos diários reais em9–12/10. Incidente25h49 documentado. Watchdog horário autorizado/publicado:23 * * * *, refresh23h, manifesto HMAC; backup/restore e replay fresco passaram no runner real. **RPO≤24h é alvo monitorado, não SLA**: scheduler best-effort explicitamente aceito. Acompanhar primeiro evento schedule da nova cadência, sem confundir dispatch com execução automática.
- [x] Quotas/termos consultados: GitHub runner padrão em repo público; B2 primeiros10 GB por conta, compartilhados. Limites64 MiB/dump,768 MiB/bucket/1000versões; operador confirmou caps US$0. Falha/quota/atraso são incidentes, sem upgrade automático.
- [x] db:generate, Prisma validate, migrate deploy/status passaram;5/5 migrations, schema up-to-date. Nunca migrate dev/reset/db push em Production.
- [x] ADMIN bootstrap manual/role confirmados; seed envs somente no processo manual, ausentes no runtime; sem senha/hash registrados.
- [x] Key Production exclusiva/restrita ao bucket privado de currículos: upload/get/delete/listVersions/deleteVersion sintéticos passaram, anonymous negado/ACL privada. Key de backup separada e restrita ao bucket/prefixo próprios.
- [x] Keys antigas identificadas; operador decidiu **manter e revisar manualmente**. Duas tentativas Production antigas e key ampla local não são usadas pelo runtime/backup. Nenhuma revogação executada.

## Gates, contratos e smoke

- [x] Suite410 passaram +35integrações opt-in em7 suites PostgreSQL locais/schema temporário =445 testes. Provider mocks e B2 sintético incluídos; sem testes sobre contas reais.
- [x] Typecheck sem incremental, lint, pnpm build, backend:exposure, scanner e diff check passaram.
- [x] Audit exit1 **exatamente**3advisories CLI documentados,2 altos/1 moderado/0críticos; nenhum novo advisory runtime aceito. [Exposição](DEPENDENCY_EXPOSURE_REPORT.md).
- [x] Build remoto: pnpm backend:env && pnpm build && pnpm backend:exposure. finalize-build executado. Manifests/standalone gerados na Vercel:22 traces/551 paths/1637 arquivos, zero envs/secrets embutidos/pacotes documentados. Sem next build direto.
- [x] Artefato remoto inspecionado dentro do build real; API de files indisponível no deployment Git e ZIP final das lambdas não baixado. Prova de exposição usa manifests/standalone reais da Vercel, não suposição do build local.
- [x] Smoke HTTPS no release Git, USER A/USER B/ADMIN sintéticos: register/login/logout/me, PDF/DOCX, Profile/Preferences, onboarding/jobs/feedback, admin/toggle. USER→admin403; cross-user bloqueado inclusive ADMIN→feedback terceiro404; userId forjado não controla ownership. Fixtures removidas.
- [x] Cookie HttpOnly/Secure/SameSite=Lax/path/, no-store, origem cruzada403 e DTO sem storageKey/hash/token/stack verificados. Headers HTTPS nosniff/DENY/HSTS/CSP confirmados. Cadastro idempotente/erro genérico/validação também cobertos por contratos isolados.
- [x] Bug Vercel4,5MB: cap **HTTP4 MiB**, explicitamente autorizado; domínio5 MiB/compensação B2/DB preservados. HTTPS4 MiB201 e4 MiB+1=400 controlado. Acima do limite da plataforma pode haver413 antes do handler.
- [x] Limiter PostgreSQL: duas sessões compartilham429/Retry-After, buckets confirmados. DB inacessível em servidor Production **isolado** retorna503/no-store sem fallback; banco real não desligado.

## Crons, dados e observabilidade

- [x] Vercel crons registrados/ativos: jobs GET /api/internal/jobs/run,0 6 * * *; GC GET /api/internal/resumes/gc,0 7 * * *. Hobby pode atrasar dentro da hora; uso/quotas respeitados.
- [x] Operador executou ambos pelo botão Run; completed aprovados comprovaram Bearer automático. Sem auth401; cookie/role/USER/ADMIN não autorizam cron. Replay protegido passou.
- [x] Fluid Compute confirmado; jobs300s/deadline240s,GC60s/deadline45s. Locks diretos independentes. Jobs409 ocupado comprovado em Production sem coleta concorrente;429/503/parcial cobertos nos contratos isolados.
- [x] CI&T/Swile/Arbeitnow separadas por JobSource; Brasil-first/dedupe/lifecycle preservados. Último smoke:228 CI&T/33 Swile/1462 Arbeitnow,1723 jobs históricos. Replay sem duplicação; active/lastSeenAt conferidos. Ausência/falha não apaga histórico/feedback.
- [x] GC executado somente após conferir DB/bucket/referências/ACL/24h:7versões/3referências/0 candidatas antigas no smoke, nenhuma exclusão inesperada. Limpeza final apenas contas/versões sintéticas próprias.
- [x] Logs reais started/completed/sources/counters/durationMs/partial/timedOut revisados; sem PII, secrets, descrições integrais ou errors raw. Falha GC não aborta jobs; checkpoint/replay/parcial cobertos isoladamente.

## Obrigações recorrentes e limites aceitos do alpha

Revisar diariamente idade do backup e logs dos três schedulers. GitHub pode atrasar/descartar schedules e desativá-los após60dias sem atividade; ausência/falha/idade≥24h é incidente. O watchdog reduz risco, não dá garantia contratual de RPO. A retenção foi testada; ainda não havia7dias de arquivos reais para comprovar exclusão antiga.

Proteger acesso aos secrets/cofre e testar restore periodicamente; revisão manual das keys antigas, sem revogação autorizada. Preview/Development não recebem secrets Production. Monitorar quotas, conexões e matching O(usuários×vagas) antes de ampliar público. Email recovery/verification, alertas externos e frontend production readiness estão fora desta ativação.

Arquitetura/features backend congeladas. Não iniciar frontend/LLM/auto-apply automaticamente.

BACKEND PRODUCTION READY
