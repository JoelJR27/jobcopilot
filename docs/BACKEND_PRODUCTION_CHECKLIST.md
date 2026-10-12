# Checklist de produção do backend

Fase 8, 2026-10-08. **BACKEND PRODUCTION BLOCKED**. Projeto Vercel vinculado e envs Production configuradas; nova key B2 validada e env gate exit 0. **Deploy e cron Vercel ainda não ativos/verificados**. Neon Free: retenção configurada 6h, abaixo de 7 dias; cópia histórica isolada do banco vazio validada, sem restore sobre Production. Evidências atuais em [PHASE_8_FINAL_REPORT.md](PHASE_8_FINAL_REPORT.md); histórico em [PHASE_8_PRODUCTION_ACTIVATION_REPORT.md](PHASE_8_PRODUCTION_ACTIVATION_REPORT.md). Não abrir produção enquanto itens operacionais abaixo estiverem pendentes.

## Evidências verificadas da ativação

- [x] CLI Vercel autenticada; projeto JobCopilot criado/vinculado localmente. Node 24, `pnpm build` e install `pnpm install --frozen-lockfile && pnpm db:generate` configurados remotamente. Integração Git/release e região continuam pendentes.
- [x] As 14 envs configuradas têm somente target Production; secrets usam tipo sensitive. Nenhuma env SEED_ADMIN está no projeto. COREPACK habilitado. Gate final na sessão segura com a nova key: exit 0, valid=true, invalidFields vazio.
- [x] Neon pooled e direct: conexão TLS 1.3 com certificado validado. Banco de destino vazio, zero tabelas públicas e nenhuma migration aplicada. Nenhuma migration/seed executada nesta ativação.
- [x] B2: substituta restrita ao bucket com somente listBuckets/readBuckets/listFiles/readFiles/writeFiles/deleteFiles, armazenada em Vercel Production após validar upload/get/delete/listVersions/deleteVersion, ACL privada e anonymous access negado. Objeto sintético sem versões remanescentes. Nenhuma key anterior revogada.
- [x] API Neon confirmou endpoint/branch de Production, organização Free e history_retention_seconds=21600 (6h). Cópia histórica isolada production-restore-verification-20261008 validada por leitura/TLS, com zero tabelas públicas e sem escrita no original. Branch de teste preservada; isso não comprova recuperação de dados futuros nem retenção de 7 dias.
- [x] Inventário read-only do bucket configurado: zero versões sob resumes/, zero candidatas com mais de 24h, listagem completa de uma página; nenhuma exclusão. Consulta usou credencial anterior do operador, não foi teste de GC Production.
- [x] Gates locais: geração/validação Prisma, 436 testes (PostgreSQL local isolado e B2 sintético), typecheck, lint, build, exposição, scanner de secrets e diff check passaram. Audit permanece exatamente nos três advisories CLI documentados.
- [x] Nenhuma .env versionada; scanner de working tree e três commits recentes sem possível segredo encontrado. `.vitest/` ignorado para impedir inclusão do relatório local gerado.
- [ ] Backup com retenção ≥7 dias e restore isolado testado da estratégia final. PITR Free de 6h não substitui o requisito; pg_dump diário criptografado em host/destino privado já disponíveis é alternativa proposta, ainda não configurada.
- [ ] Deployment/artefato remoto/smoke HTTPS/rate limiter distribuído/crons reais. Domínio reservado não equivale a aplicação validada.

Os itens compostos abaixo permanecem abertos quando parte deles ainda não foi verificada.

## 1. Plataforma e envs

- [ ] Vincular o repositório ao projeto Vercel; selecionar Node 24, pnpm 11 e região próxima ao PostgreSQL.
- [ ] Confirmar que o uso pretendido é permitido pelo plano escolhido. Hobby é pessoal/não comercial; não presumir contratação paga nem cobertura comercial gratuita.
- [x] Configurar **Production** server-only `DATABASE_URL`, `DIRECT_DATABASE_URL`, `APP_URL`, `RATE_LIMIT_MODE=postgres`, `RATE_LIMIT_KEY_SECRET`, `CRON_SECRET`, `INTERNAL_JOBS_SECRET` e envs B2.
- [ ] DATABASE_URL: conexão runtime PostgreSQL, preferencialmente pooler transaction mode compatível com Prisma 7/pg. DIRECT_DATABASE_URL: conexão direta/session mode para advisory locks e migrations, mesmo banco/schema público. Não usar transaction pooler para lock de sessão.
- [ ] APP_URL HTTPS público. RATE_LIMIT_KEY_SECRET aleatório 32..256 caracteres. CRON_SECRET e INTERNAL_JOBS_SECRET aleatórios 32..256 e **iguais**; diferentes da key do limiter. Gerar e armazenar fora de código/chat/logs.
- [x] B2_ENDPOINT HTTPS, B2_REGION, B2_KEY_ID, B2_KEY_NAME, B2_APPLICATION_KEY e B2_BUCKET_NAME. Bucket privado e key restrita ao bucket; incluir permissões necessárias para listar/excluir versões na manutenção, sem acesso a outros buckets.
- [ ] Rotacionar as keys B2 identificadas na `.env` local antes do deploy, sem publicar seus valores; usar credenciais distintas de dev/test e produção. `.env` está ignorada, sem exposição identificada em commits, mas não deve ser enviada como artefato.
- [ ] Nenhum secret em NEXT_PUBLIC. `.env.example` apenas campos vazios. Preview/Development devem usar banco/bucket próprios e nunca secrets/dados privados Production.
- [x] Executar `pnpm backend:env` com envs de produção em ambiente seguro: saída somente nomes inválidos. Exit 0 é requisito, não prova conectividade/TLS/ACL.

**Separação:** runtime usa DB/B2/rate limiter; cron acrescenta conexão direta e os dois secrets operacionais. Providers CI&T/Swile/Arbeitnow têm configuração allowlisted server-side, sem API key. Seed usa SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD **somente no bootstrap manual**; não deixar essas envs no runtime. Build usa Prisma schema/config/Next; geração não precisa conectar ao banco, e nenhum secret deve ser incorporado a assets do browser. Migrações precisam da conexão direta. NODE_ENV/VERCEL são metadados da plataforma; JOBCOPILOT_DB_TESTS é exclusivamente teste local opt-in.

## 2. Banco, migrations e storage

- [ ] Provisionar/revisar o PostgreSQL existente, sem troca automática de provider. TLS remoto verifica certificados (`rejectUnauthorized: true`); nunca desativar verificação. Se o provider exigir CA privada, provisionar CA corretamente antes de liberar, sem fallback inseguro.
- [ ] Conferir limites de conexão: pool runtime **2 por instância**, connect/statement timeout **5s**, idle **10s**; pipeline cria outro pool2 e uma conexão direta de lock; GC usa uma conexão direta própria. Multiplicar pelos processos/instâncias concorrentes e reservar conexões para administração/migrations. Pooler externo não torna conexões ilimitadas.
- [ ] Credencial runtime com mínimo privilégio para tabelas de aplicação/limiter/checkpoint; credencial de migrations separada quando o provider permitir. Apenas operador pode alterar envs/fontes configuradas.
- [ ] Backup automático/encriptado antes de migration: meta inicial RPO≤24h, retenção≥7 dias e restauração testada em banco isolado. Confirmar capacidades/quota gratuitas do provider; backup não está configurado por este código.
- [ ] `pnpm db:generate`; `pnpm exec prisma validate --config prisma7.config.ts`; `pnpm exec prisma migrate deploy --config prisma7.config.ts`; `pnpm exec prisma migrate status --config prisma7.config.ts`. Nunca migrate dev/reset no banco de produção.
- [ ] Cinco migrations aplicadas, incluindo `20261007020000_backend_readiness`. A migration é aditiva e dá janela inicial aos Jobs antigos; não apaga Jobs/feedback.
- [ ] Bootstrap admin manual via `pnpm db:seed`, sem senha padrão ou hardcode. Remover envs de seed após executar. ADMIN continua com Profile/Preferences/jobs próprios.
- [x] Verificar privacidade/ACL/policy B2 no destino e testar somente objeto sintético com prefixo de teste, incluindo deleteVersion. Nunca publicar storageKey ou URL pública de currículo.

## 3. Gates e contratos

- [ ] `pnpm test` (unidades/provider mocks). Para integrações PostgreSQL: banco **local** e `JOBCOPILOT_DB_TESTS=1`; schemas test_backend_* temporários. B2 atual tem integração real com objetos sintéticos; executar controladamente, sem apontar testes para contas reais.
- [ ] `pnpm exec tsc --noEmit --incremental false`; `pnpm lint`; `pnpm build`; `pnpm audit --prod`; `pnpm backend:exposure`; `node scripts/check-repository-secrets.mjs`; `git diff --check`.
- [ ] Audit pode retornar exit1 **somente pelos três avisos CLI documentados** em [DEPENDENCY_EXPOSURE_REPORT.md](DEPENDENCY_EXPOSURE_REPORT.md). Nenhum crítico/alto de runtime é aceito. Conferir empacotamento real Vercel novamente.
- [ ] Usar o Build Command `pnpm build` sem bypass da finalização: Next standalone copia envs locais por padrão; finalize-build remove somente `.env*` do artefato gerado. `pnpm backend:exposure` também recusa arquivos env e valores de secrets locais encontrados em JS/JSON/HTML. Não publicar build feito com `next build` direto sem esses gates.
- [ ] Smoke no deployment com contas sintéticas isoladas: register/login/logout, PDF/DOCX, Profile/Preferences, jobs/feedback próprio, ADMIN métricas, cross-user, cron sem auth. Não usar contas/dados de usuários reais para teste.
- [ ] Verificar no-store em APIs autenticadas/erros, cookies HttpOnly/Secure/SameSite=Lax, headers nosniff/DENY/HSTS/CSP existente, origem cruzada 403, erro inesperado genérico. Testar HTTPS real/certificados no destino.
- [ ] Confirmar respostas públicas de cadastro iguais para email novo/existente; registro não altera senha/role existente. Login não publica sessão/hash; token somente cookie HttpOnly.

## 4. Crons e observabilidade

- [ ] Verificar `vercel.json`: jobs `0 6 * * *` (**03h Brasília**) e GC `0 7 * * *` (**04h Brasília**), ambos GET uma vez/dia e independentes. Confirmar quota/plano; Hobby pode atrasar dentro da hora e não garante minuto exato.
- [ ] Jobs GET `/api/internal/jobs/run`: maxDuration300, deadline global240s. GC GET `/api/internal/resumes/gc`: maxDuration60, deadline45s. Confirmar Fluid Compute/duração efetiva do projeto e margem operacional.
- [ ] Vercel envia Authorization Bearer com CRON_SECRET. Nunca query string/cookie/role/user-agent como autorização. GET exige secrets iguais; POST operacional usa INTERNAL_JOBS_SECRET. Usuários/ADMIN comuns não têm trigger do pipeline.
- [ ] Fazer deploy Production, confirmar **os dois crons no dashboard**, executar uma vez de forma protegida e conferir logs. Só então registrar scheduler ativo. Não executar GC do bucket real antes de conferir banco correto/ACL/janela24h.
- [ ] Validar lock409 sem operação concorrente, 429 com Retry-After (5 chamadas/10min por trigger), 503 parcial/indisponível, 200 sucesso. Pipeline/GC têm locks distintos e não se bloqueiam. Falha GC não aborta jobs.
- [ ] Verificar `job_pipeline_started/completed/busy/failed` e `resume_gc_started/completed/busy/failed`, duração/counters/partial/timedOut. Há contagens, não PII, descrições, tokens ou exceptions raw.
- [ ] Para falha parcial/interrupção: investigar evento sanitizado, repetir via POST Bearer ou `pnpm jobs:run` após Retry-After. Checkpoint retoma último lote confirmado; unique/upserts mantêm idempotência. Scheduler não faz retry automático implementado pelo projeto.
- [ ] Revisar logs diariamente no alpha; ausência de completed após started ou cron esperado é incidente. Não há alertas externos pagos, histórico completo de runs ou checkpoint exposto a ADMIN.

## Limitações conhecidas

Rate limiter PostgreSQL é distribuído/global entre instâncias da mesma base, com HMAC e teto10mil buckets; indisponibilidade do banco falha fechado503. Modo local tem teto2mil e fica apenas em dev/test. Não usa IP/header do cliente. Limites globais conservadores podem causar indisponibilidade sob abuso; avaliar WAF nativo gratuito como defesa adicional respeitando quota/termos, sem ativar cobrança implicitamente.

Jobs desaparecidos são desativados após **14 dias sem observação**, exclusivamente após coleta completa válida daquela fonte; erro externo não expira. Após **30 dias sem observação**, leitura/matching já ocultam mesmo se a fonte falha permanentemente. Não implica confirmação de vaga fechada. Histórico e feedback permanecem; reobservação atualiza/reativa a mesma row.

Throughput local não representa latência do PostgreSQL remoto. Validar volume no destino antes de aumentar público; matching continua O(usuários×vagas), mas em lotes100/50 e com checkpoint. Full CSP com nonce, recuperação/verificação de email, UX de auth e browser end-to-end são dívidas explícitas; frontend e LLM não foram implementados nesta fase.
