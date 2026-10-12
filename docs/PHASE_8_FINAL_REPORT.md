# Fase 8 — blockers operacionais de ativação

> Relatório histórico de 2026-10-08. O estado atual de ativação foi atualizado em [PHASE_8_RELEASE_REPORT.md](PHASE_8_RELEASE_REPORT.md) e [BACKEND_PRODUCTION_CHECKLIST.md](BACKEND_PRODUCTION_CHECKLIST.md); não usar os blockers abaixo como estado atual.

2026-10-08 — **BACKEND PRODUCTION BLOCKED**.

Nenhuma feature, contrato HTTP, arquitetura, matching, collector ou frontend foi alterado. Migrations, seed, deploy, smoke HTTPS e crons não foram executados: a retenção de backup obrigatória permanece não atendida. Somente este relatório e BACKEND_PRODUCTION_CHECKLIST.md foram alterados nesta continuação; alterações anteriores do working tree foram preservadas.

## Verificações concluídas

| Verificação | Evidência real |
| --- | --- |
| Neon de destino | API identificou projeto/endpoint/branch correspondentes ao DATABASE_URL_PRODUCTION informado; root branch; organização Free |
| Retenção configurada | history_retention_seconds=21600, ou 6 horas; não 7 dias |
| Estado do original | Leitura PostgreSQL: zero tabelas públicas, TLS com certificado autorizado; nenhuma escrita |
| Cópia histórica | Branch production-restore-verification-20261008 criada a partir de timestamp histórico do original; conexão isolada, TLS autorizado, zero tabelas públicas; branch original preservada |
| B2 Production | Nova substituta autorizada, restrita ao bucket privado e permissões mínimas, testada antes de armazenar somente em Vercel Production |
| B2 smoke sintético | Upload, get com comparação dos bytes, delete, listVersions e deleteVersion passaram; ACL sem grants públicos; anonymous access negado; zero versões remanescentes do objeto de teste |
| Env gate final | `pnpm backend:env`, exit 0; backend_environment_check valid=true, invalidFields=[]; executado na mesma sessão segura em memória com a nova key |
| Env metadata remoto | 14 variáveis, targets somente Production; B2 key ID/application key/name sensitive; nenhum SEED_ADMIN nem NEXT_PUBLIC |
| GC inventário | Listagem read-only completa de resumes/: 0 versões, 0 com mais de 24h, 1 página; sem conteúdo/keys exibidos e sem exclusões |
| Vercel | Projeto vinculado, Node 24 e buildCommand pnpm build; nenhum deployment; domínio reservado https://jobcopilot-zeta.vercel.app ainda não validado por smoke |

A branch histórica é um teste limitado de recuperação de **estado vazio** dentro da janela disponível. Não foi restaurada uma branch existente; não houve escrita nem interrupção do original. A branch isolada foi mantida, sem operação destrutiva. Isso não testa restauração de dados de aplicação futuros, não configura backup diário e não estende a retenção.

Após as alterações documentais: scanner do working tree e três commits recentes passou (246 arquivos, nenhum possível secret identificado; .env ignorada); git diff --check exit 0, apenas avisos de CRLF. Suite/build não foram repetidos nesta continuação exclusivamente operacional/documental; os 436 testes e gates locais anteriores permanecem evidência histórica, não smoke Production.

## Backup/restore: capacidade e alternativa

A API autenticada confirmou o plano Free e a janela real de 6h. A documentação atual descreve PITR de 6h no Free, com limite de histórico, e uma snapshot manual; uma snapshot isolada não equivale a backup diário com retenção de 7 dias. Nenhuma snapshot/upgrade/configuração de retenção paga foi aplicada. [Planos Neon](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md), [Free atual](https://neon.com/blog/neon-free-plan-1-gb-per-project).

O teste seguro usa **Create branch** com parent_id e parent_timestamp do original e endpoint independente. Consultar schema/contagens na nova branch; conferir explicitamente que seu host difere do Production. Não executar Branch Restore tendo Production como alvo, porque isso sobrescreve schema/dados e pode interromper conexões. [Create branch](https://api-docs.neon.tech/reference/createprojectbranch), [Instant restore](https://github.com/neondatabase/website/blob/main/content/docs/postgres/backup-restore/branch-restore.md).

Alternativa proposta sem contratação: executar pg_dump diariamente num host já disponível, criptografar o arquivo, guardar cópias datadas em armazenamento privado dentro da quota gratuita e reter cada cópia por pelo menos 7 dias. O job deve registrar apenas sucesso/duração, alertar ausência/falha e manter RPO≤24h. Configurar o agendamento antes da liberação; um notebook desligado não garante essa meta. Destino/host/quota e guarda da chave de criptografia ainda precisam ser definidos pelo operador. Não foi criada infraestrutura nem presumida cobrança zero de storage sem verificar quota.

Procedimento de validação: usar cliente pg_dump compatível com a versão do servidor, conexão direta com TLS verificado e autenticação privada fora de argumentos/logs/Git; gerar arquivo custom-format fora do repositório; criptografar; calcular checksum. Recuperar/descriptografar no ambiente seguro e executar pg_restore --exit-on-error --no-owner --no-privileges em banco/branch vazio **isolado**, com URL distinta verificada. Conferir schema/migrations/contagens sem expor dados; nunca restore/reset no original. Testar também guarda/acesso à chave de decrypt e registrar evidência sanitizada. pg_dump/pg_restore não estavam disponíveis no PATH desta máquina. [PostgreSQL backup](https://www.postgresql.org/docs/current/backup-dump.htm), [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html).

## Keys B2: manter e revogar

- Manter conceitualmente a **key substituta validada, restrita ao bucket, atualmente armazenada somente em Vercel Production**.
- Revogar, após autorização explícita e identificação pelo operador, as **duas keys anteriores de tentativa Production**: a criada sem uso e a substituída nesta continuação.
- Revogar a **key antiga ampla do operador** após verificar dependências de dev/test e autorizar sua rotação. O inventário confirmou capacidade administrativa ampla; não deve ser credencial do backend Production.

Nenhuma key foi revogada. Nenhum ID, token, storageKey, connection string, conteúdo de currículo ou credencial é necessário neste relatório. As credenciais novas não foram salvas localmente nem expostas; o operador deve manter um cofre seguro para futuras verificações, pois secrets sensitive da Vercel não podem ser recuperados pela API. [Vercel Secret envs](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types).

## Blockers objetivos restantes

1. **Retenção/backup:** Neon Free fornece 6h; não existe estratégia configurada e validada que cumpra RPO≤24h, retenção≥7 dias e restore isolado da estratégia final. Migrations continuam bloqueadas; não houve aceitação de risco ou dispensa do requisito.
2. **Migrations/seed:** Production permanece vazio, 0/5 migrations; bootstrap ADMIN ainda não executado. Dependem do item 1; B2 e env gate já passaram. Seed deve usar envs temporárias e depois confirmar ADMIN/ausência de SEED_ADMIN no runtime.
3. **Deployment e verificação real:** nenhum deployment Production. Pendem HTTPS saudável, artefato remoto sem env/pacotes vulneráveis documentados, adequação do plano Vercel ao uso, região/budget/privilégios DB e smoke sintético USER A/B/ADMIN dos fluxos exigidos. Gates/exposição locais anteriores não substituem o artefato remoto.
4. **Rate limit Production:** falta comprovar compartilhamento PostgreSQL, 429/Retry-After e 503 sem fallback via deployment real. Não interromper o banco Production para simular falha; definir teste isolado/controlado.
5. **Crons Production:** jobs 06 UTC e GC 07 UTC estão preparados, ainda sem dashboard/execução/logs confirmados. Pendem pipeline real CI&T/Swile/Arbeitnow, contagens/eventos sanitizados e GC protegido após revalidar DB/bucket/candidatos/janela24h no momento da execução. O inventário vazio atual não autoriza exclusões futuras indiscriminadas.

Não declarar BACKEND PRODUCTION READY, não registrar scheduler active in production e não avançar para frontend. A próxima ação necessária é definir e comprovar a estratégia de backup com o operador, então executar as etapas restantes na ordem do checklist.
