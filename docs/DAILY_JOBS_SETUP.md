# Agendamento diário — Vercel

Plataforma confirmada: Vercel. **Ativo/verificado em Production em 2026-10-12**, no alpha pessoal/não comercial autorizado. Os dois crons estão registrados no deployment saudável; operador executou ambos pelo botão Run e os logs completed comprovaram Bearer automático. Replays HTTPS protegidos também passaram. Evidências em [PHASE_8_RELEASE_REPORT.md](PHASE_8_RELEASE_REPORT.md) e [BACKEND_PRODUCTION_CHECKLIST.md](BACKEND_PRODUCTION_CHECKLIST.md). Registro ativo e Run não são garantia de minuto exato nem evidência de todos os ticks futuros.

## Triggers independentes

| Rotina | Endpoint GET cron | UTC | Brasília | Duração máxima / deadline |
| --- | --- | --- | --- | --- |
| Jobs + matching | /api/internal/jobs/run | 0 6 * * * | 03h | 300s / 240s |
| GC versionado de resumes | /api/internal/resumes/gc | 0 7 * * * | 04h | 60s / 45s |

Ambos constam em vercel.json; uma vez/dia cada. Falha do GC não aborta jobs. Locks PostgreSQL dedicados e independentes. A janela do GC continua24h; ele nunca roda dentro de UploadResume. Não executar GC real antes de conferir referências do banco correto e privacidade/policy B2.

Jobs: pnpm jobs:run e POST operacional chamam o mesmo RunDailyJobPipeline usado no GET. GC: GET/POST chamam RunResumeGc + CleanupOrphanedResumes. POST aceita Authorization Bearer com INTERNAL_JOBS_SECRET; GET também exige CRON_SECRET igual. Nada de query string, cookie, role ou user-agent como autorização. Usuários/ADMIN comuns não podem acionar arbitrariamente.

## Ativação e futuras reconfigurações

1. Vincular projeto Vercel, Node 24/pnpm, confirmar plano/uso permitido e quotas. Hobby é pessoal/não comercial; nenhum plano pago foi contratado.
2. Configurar Production DATABASE_URL runtime/pooler compatível e DIRECT_DATABASE_URL direta/session para locks/migrations, mesmo banco/schema. TLS verificado, pool2 por instância, connect/statement5s; aplicar migrate deploy e confirmar status. Configurar backup e restauração.
3. Configurar APP_URL HTTPS e B2 privado/least privilege. Configurar RATE_LIMIT_MODE=postgres e RATE_LIMIT_KEY_SECRET aleatório32..256. Limiter PostgreSQL compartilhado; local somente dev/test.
4. Gerar CRON_SECRET/INTERNAL_JOBS_SECRET aleatórios32..256 iguais no secret store Production. Nunca NEXT_PUBLIC, código, chat, logs ou query. Vercel envia Bearer automaticamente.
5. Executar pnpm backend:env em ambiente seguro; obter exit0. Rodar gates do checklist e revisão de runtime exposure. Deploy Production e confirmar **os dois crons no dashboard**.
6. Verificar duração efetiva/Fluid Compute, chamar triggers de forma protegida e validar logs/counters. Só registrar automação ativa após evidência de execução no destino.

## Backup independente

Backup PostgreSQL não executa nas Functions Vercel. Workflow GitHub Actions com watchdog horário e refresh23h, bucket B2 privado separado e retenção >7dias: [BACKUP_SETUP.md](BACKUP_SETUP.md). Scheduler best-effort explicitamente aceito; monitorar idade do snapshot/RPO≤24h e investigar atraso/falha. Não confundir esta automação com os crons jobs/GC nem executar GC antes de conferir DB/B2 após qualquer restore/reconfiguração.

## Operação e replay

Respostas mínimas/no-store: 200 sucesso,409 lock ocupado,429 com Retry-After,503 parcial/indisponível; sem secret →401/503. Rate limit5 execuções/10min por trigger é distribuído entre instâncias da mesma base. Lock de sessão não pode usar pooler transaction mode; limiter usa lock transacional curto.

Pipeline tem deadline global/cancelamento cooperativo, páginas50 usuários/100 jobs, bulk upserts e checkpoint atômico por lote. Queries em andamento limitadas5s, não cancelamento instantâneo. Replay idempotente retoma cursor confirmado; sem transação aberta durante HTTP externo. Uma fonte falha não impede as outras nem matching já persistido enquanto há prazo.

GC pagina/limita versões, preserva keys referenciadas e recentes24h, remove por versão, reporta falha parcial e tolera replay. Nenhum conteúdo de currículo é logado. Falha/listagem excessiva falha fechado; consultar PHASE_7_REPORT para limites.

Observar eventos JSON job_pipeline_started/completed/busy/failed e resume_gc_started/completed/busy/failed, duração, contagens, partial/timedOut. Ausência de completed após started ou execução diária esperada exige investigação. Não há alertas externos, histórico completo de runs ou retry automático próprio. Repetir manualmente após Retry-After com header secreto; não colar token em comando versionado/log compartilhado.

Documentação oficial consultada em2026-10-08: [Cron](https://vercel.com/docs/cron-jobs), [segurança](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [limites/quota](https://vercel.com/docs/cron-jobs/usage-and-pricing), [duração](https://vercel.com/docs/functions/configuring-functions/duration), [Hobby](https://vercel.com/docs/plans/hobby). Hobby pode executar dentro da hora, sem minuto exato; cron consome quotas de Functions. Confirmar que a validação cabe no plano permitido sem custo.

Se uso/plano não permitir cron gratuito, manter os mesmos use cases/adapters em host próprio disponível ou cron externo gratuito com POST/Bearer, mediante escolha explícita de deployment; não contratar/trocar plataforma silenciosamente. Sem setInterval, fila, worker, Redis/BullMQ ou execução em background pós-resposta.
