# Backup de produção — alpha pessoal

Configurado e verificado em 2026-10-12. PostgreSQL Neon Free mantém PITR de 6h; o complemento é `pg_dump` criptografado em bucket B2 privado separado dos currículos. Não usa máquina pessoal nem processo Next.js como scheduler.

## Automação e custo

Workflow `.github/workflows/database-backup.yml`, repositório público `JoelJR27/jobcopilot`, runner padrão Ubuntu 24.04 e Node 24. O GitHub não cobra esses runners padrão em repositórios públicos; não são usados runners maiores nem armazenamento de artifacts para backups. [Cobrança oficial](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Após um intervalo real de **25h49** entre backups diários, o operador autorizou watchdog `23 * * * *`: verifica a cada hora e cria uma cópia quando o último snapshot verificado atinge **23h**. Um manifesto HMAC vincula timestamp, checksum e versão imutável; nunca confiar em timestamp sem assinatura. Replay com snapshot recente não faz dump nem baixa novamente o arquivo completo. A rotina já teve execuções automáticas diárias reais em 9, 10, 11 e 12 de outubro; a mudança de cadência foi publicada e validada no mesmo runner por dispatch.

**RPO operacional alvo ≤24h, sem SLA do scheduler.** O watchdog dá margem de recuperação, mas não garante execução pontual nem elimina a possibilidade de violação. GitHub pode atrasar ou descartar eventos e desabilita schedules públicos após 60 dias sem atividade. Essa limitação best-effort foi explicitamente informada e aceita pelo operador ao autorizar a mudança. Monitorar idade do último snapshot, não apenas sucesso do último run, que pode ser um skip. [Atrasos](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows), [inatividade](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).

B2 oferece os primeiros **10 GB de storage por conta** gratuitamente; quota é compartilhada com currículos, não ilimitada. O script limita cada dump a 64 MiB e o inventário do bucket de backup a 768 MiB/1.000 versões; falha fechado antes de exceder seu orçamento. O operador confirmou caps de storage/download/transações em **US$0**. Atingir quota/cap pode impedir backup e deve ser incidente, nunca contratação automática. [Preços](https://www.backblaze.com/cloud-storage/pricing), [caps](https://www.backblaze.com/docs/en/cloud-storage-data-caps-and-alerts).

## Segurança e retenção

- GitHub Environment `database-backup`, permitido somente em `main`; oito secrets criptografados: `DIRECT_DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_B2_ENDPOINT`, `BACKUP_B2_REGION`, `BACKUP_B2_BUCKET`, `BACKUP_B2_KEY_ID`, `BACKUP_B2_APPLICATION_KEY`, `NEON_API_KEY`. Valores não estão no repositório nem em artifacts.
- Key B2 exclusiva, restrita ao bucket separado e prefixo `database-backups/`, com permissões mínimas de leitura/listagem/escrita/exclusão; não reutiliza a key da aplicação.
- Dump custom-format de `public`, PostgreSQL 18 em imagem oficial fixada por digest. Conexão direta; credenciais somente em env de subprocesso, nunca URL/senha nos argumentos. `verify-full` e CA validada, sem TLS bypass.
- AES-256-GCM, IV aleatório, SHA-256 autenticado no envelope e checksum do ciphertext. Plaintext permanece em memória limitada, sem arquivo no runner/repositório. Logs somente eventos, códigos sanitizados, duração, tamanho e prefixo de checksum.
- Arquivos datados e versões retidos por **mais de sete dias completos**. Exclusão versionada exige nome do prefixo/formato conhecido e tanto data do arquivo quanto `LastModified` anteriores à janela. Nomes desconhecidos não autorizam exclusão. Ainda não haviam decorrido sete dias de operação nesta verificação; a regra foi testada, não foi inventada uma exclusão antiga real.
- GitHub concurrency sem cancelamento e advisory lock PostgreSQL de sessão separado dos crons da aplicação; deadline 12min, workflow 20min, ferramentas PostgreSQL 180s. Falha/lock ocupado são visíveis no Actions. Não há transação SQL aberta durante upload HTTP.

## Restore seguro

No Actions, executar manualmente **Production database backup** em `main` com `verify_restore=true`. A rotina gera snapshot fresco, criptografa, armazena, recupera a versão exata, valida checksum, descriptografa e cria/reutiliza somente branch descartável `backup-restore-test-*` do projeto allowlisted. Confere identidade/host distintos de Production antes de preparar `public` no destino.

Usa `pg_restore --exit-on-error --no-owner --no-privileges`, comparando tabelas, contagens, migrations, colunas e índices com a origem. Remove somente a branch temporária registrada depois de sucesso; em falha a preserva para investigação. **Nunca selecionar Production como alvo, nunca reset/db push.** Restore de desastre deve também reprovisionar role/grants mínimos do runtime e conferir as referências B2 antes de reativar o GC, pois o dump não inclui roles globais nem privilégios.

Evidência real: run [38269261370](https://github.com/JoelJR27/jobcopilot/actions/runs/38269261370), `database_restore_verified`, **13 tabelas / 5 migrations**, comparação integral aprovada; backup de 2.765.147 bytes, 69.269ms, checksum parcial `d311f153d8f4`, branch descartável removida. Replay [38269619596](https://github.com/JoelJR27/jobcopilot/actions/runs/38269619596): `database_backup_fresh`, 1.270ms, sem nova cópia. As duas primeiras tentativas revelaram schema ausente na branch descartável; preparação com `DROP SCHEMA IF EXISTS` corrigida exclusivamente no alvo isolado.

## Operação

Revisar Actions e idade do snapshot diariamente no alpha; confirmar notificações de falha da conta. Falha, ausência de run, snapshot com idade ≥24h, perda de acesso aos secrets ou quota excedida são incidentes. Reexecutar o workflow após corrigir a causa e repetir restore isolado periodicamente. A chave de criptografia não é recuperável pela API de secrets; proteger acesso ao Environment e manter guarda em cofre do operador antes de substituir/remover qualquer secret. Não imprimir nem copiar valores para issues/logs.

Não alterar retenção, elevar caps ou contratar serviços silenciosamente. Não revogar a key de backup enquanto existirem arquivos que dependam dela/chave criptográfica. A revisão de keys antigas da aplicação é manual e independente deste workflow.
