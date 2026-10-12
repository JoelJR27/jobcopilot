# Decisões anteriores à implementação — Fase 6

2026-10-07. [Swile carreiras Brasil](https://www.swile.com.br/carreiras), [board](https://jobs.lever.co/swile), [Lever Postings API oficial](https://github.com/lever/postings-api/blob/master/README.md), [termos atuais](https://www.lever.co/legal/terms-of-service) consultados. O GET público JSON fixo https://api.lever.co/v0/postings/swile?mode=json está disponível: 29 postings, 14 com evidência brasileira pelo domínio existente, 6 desses remotos. Não foi necessário fallback Ubiminds. Somente postings públicos, sem scraping, candidatos, aplicação ou credenciais. Não alegamos parceria/licença de marca; revisar termos se alterados.

Reutilização mínima: LeverJobCollector configurado por uma chave allowlisted server-side (ciandt/swile), com sourceName/company/boardToken fixos. Mesmos limites/schema/normalizador, sem URLs/board do usuário. Fontes independentes e ordem CI&T, Swile, Arbeitnow.

Retenção: substituir exclusão de match inelegível por update de geographyRank=3, mantendo JobMatch e MatchFeedback. Listagem já exclui rank>=3. Reativação/replay reutilizam o mesmo match/feedback. Inativar fonte oculta matches e mantém histórico. Exclusão explícita de conta/Job permanece sujeita às relações existentes; não há endpoint destrutivo novo. Sem snapshots ou entidade nova.

Admin: guard server-side existente; métricas agregadas e fontes, sem PII/conteúdo privado. Toggle apenas active por ID UUID de fonte existente, CSRF/body limitado. Sem trigger de pipeline administrativo.

Deployment confirmado pelo usuário: Vercel. [Cron oficial](https://vercel.com/docs/cron-jobs) faz GET e usa CRON_SECRET em Authorization Bearer. Preparar GET e POST com mesmo use case/proteção e vercel.json diário 06:00 UTC. Configurar CRON_SECRET igual a INTERNAL_JOBS_SECRET no ambiente Production. Sem deploy/agendamento remoto nesta tarefa. Limites/adequação do plano e banco remoto precisam ser confirmados; nenhum serviço pago será contratado.

Hardening pontual: limites/CSRF/no-store no auth, limiters locais limitados em memória (não distribuídos), validação env controlada, headers seguros, nenhum log raw. Preservar seed/roles/Resume/arquitetura. CSP estática inicial restringe framing/base/object; CSP de scripts com nonce requer teste próprio de hidratação antes de enforcement.
