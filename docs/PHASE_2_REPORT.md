# Fase 2 — finalizar e endurecer Resume

Data: 2026-10-07. Somente Resume; Profile/Preferences não foram iniciados. Alterações da Fase 1 já presentes no working tree foram preservadas.

## Inspeção e lacunas encontradas

Os cinco documentos solicitados foram lidos integralmente antes de editar. Foram inspecionados o handler, `UploadResume`, validator, limiter, ports, composição, Prisma repository, adapter/client B2, GC e testes existentes.

Todos os status HTTP da fase já tinham testes. USER/ADMIN e isolamento na substituição de PDF também estavam cobertos. As lacunas eram:

- DOCX válido era representado somente por quatro bytes de assinatura ZIP; ZIP genérico podia passar.
- `request.formData()` podia carregar um corpo ilimitado antes da checagem de `file.size`.
- A falha de remoção do arquivo antigo logava a exception raw.
- Uma falha de compensação podia mascarar o erro original do DB.
- Não havia testes diretos de estrutura/limites ZIP, deadline do corpo, bypass de Content-Length, falha dupla DB/B2 ou DOCX no fluxo comum de ADMIN.

## Implementação

### HTTP

Autenticação continua antes de ler o corpo. Identidade vem exclusivamente de `requireAuthenticatedUser()`; campos de identidade enviados no multipart não são utilizados. Origin diferente da origem da URL da requisição, origin `null` e `Sec-Fetch-Site: cross-site` são rejeitados antes de parsing/storage. Headers encaminhados não definem confiança.

Um adapter específico limita os bytes reais do corpo a **5 MiB + 64 KiB** de margem multipart, mesmo sem Content-Length ou com valor menor falsificado. Um Content-Length excessivo permite rejeição antecipada. A leitura/parsing tem deadline de **20 segundos**; falha de stream, multipart inválido e timeout viram 400 controlado. A leitura interrompida cancela o stream.

O arquivo continua limitado a **5 MiB**, com checagem anterior a `File.arrayBuffer()` e validação autoritativa na aplicação. Resposta 201 seleciona apenas id/fileName/mimeType/fileSize/status e usa `Cache-Control: no-store`.

### DOCX

Inspeção limitada do contêiner ZIP32, baseada na [especificação ZIP da PKWARE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT), sem dependência nova, extração, interpretação XML ou gravação local.

Valida EOCD, diretório central, headers locais e seus nomes/intervalos. Exige entries não vazias `[Content_Types].xml` e `word/document.xml`; rejeita nomes duplicados, traversal, paths absolutos/Windows, symlinks, encryption, métodos além de Stored/Deflate, multidisk, versão ZIP64 e estruturas truncadas/incoerentes/sobrepostas. Suporta comentários ZIP e data descriptors ZIP32.

Limites explícitos:

| Limite | Valor |
| --- | --- |
| Entries | 256 |
| Nome de entry | 512 bytes |
| Tamanho expandido declarado por entry | 10 MiB |
| Total expandido declarado | 20 MiB |
| Razão de compressão declarada | 100:1 |

Esses são limites sobre metadados, **não garantias sobre conteúdo efetivamente descompactado**. Nesta fase nada é descompactado, portanto a inspeção não expande uma ZIP bomb. O futuro parser deverá impor limites reais durante extração e verificar integridade/estrutura de conteúdo; os metadados não são boundary suficiente para esse futuro processamento.

### Ownership e compensação

O repository procura o currículo por userId da sessão. O caso de uso também confirma o userId retornado antes de acessar storage, falhando fechado se houver inconsistência. Não há nova API de consulta/download por ID nem acesso administrativo implícito a currículos alheios.

A estratégia original é mantida: upload novo → persistência → remoção do antigo. Falha de persistência tenta remover somente o novo. Se essa compensação também falhar, o erro original é preservado e o log é uma mensagem fixa; GC posterior pode remover o órfão. Falha de remoção do antigo não altera o sucesso. Não há GC dentro do upload nem mudança de scheduler.

### Rate limiting e storage

Limiter existente preservado: **10 tentativas por usuário autenticado por hora**, em Map local do processo, com Retry-After. É proteção provisória para alpha; não é distribuído, reinicia com o processo e não coordena instâncias/serverless. A varredura de entradas expiradas é feita por request; custo e memória crescem com usuários ativos da janela.

O bucket permanece sob a configuração privada estabelecida. Não houve mudança de ACL, policy, credenciais, adapter/client B2 ou operações de storage. O estado remoto do bucket não foi reauditado nesta fase. A integração B2 não foi executada porque não houve mudança real no storage; testes usam fakes locais.

## Cobertura HTTP

| Caso | Resultado |
| --- | --- |
| Sem sessão | 401 antes de ler corpo |
| Origem inválida/cross-site | 403 antes de parsing/storage |
| Limiter | 429 com Retry-After; isolamento por usuário e expiração |
| Content-Type inválido | 400 |
| Multipart inválido | 400 |
| Sem arquivo / campo string | 400 |
| Arquivo >5 MiB | 400 antes de File.arrayBuffer |
| Corpo total excessivo | 400 antes de parser/persistência |
| TXT / PDF inválido ou vazio | 400 sem persistência |
| DOCX inválido/vazio, assinatura ZIP isolada, ZIP genérico | 400 sem persistência |
| PDF válido / exatamente 5 MiB | 201 |
| DOCX ZIP32 com entries mínimas | 201 |
| storageKey/userId internos | Ausentes do payload selecionado |
| USER e ADMIN | Mesmo fluxo para PDF e DOCX |
| userId falsificado | Ignorado; apenas currículo da sessão é atualizado |
| Falha de storage/DB/compensação | 500 genérico sem exception raw, tokens ou conteúdo nos logs |

## Arquivos desta fase

Criados:

- `application/resume/validate-docx-container.ts`
- `infrastructure/http/read-resume-form-data.ts`
- `tests/fixtures/docx.ts`
- `tests/application/resume/validate-resume-file.test.ts`
- `tests/infrastructure/http/read-resume-form-data.test.ts`
- `tests/infrastructure/http/resume-upload-limit.test.ts`
- `docs/PHASE_2_REPORT.md`

Atualizados:

- `app/api/resumes/route.ts`
- `application/resume/upload-resume.ts`
- `application/resume/validate-resume-file.ts`
- `tests/app/api/resumes/route.test.ts`
- `tests/application/resume/upload-resume.test.ts`
- `docs/CODEX_HANDOFF.md`

Sem alterações em roles/seed/autorização, schema/migrations, dependências/lockfile, ports de storage/maintenance, configuração B2 ou limiter de produção existente.

## Testes e verificações

Na raiz:

```powershell
pnpm exec vitest run tests/application/resume tests/app/api/resumes tests/infrastructure/http
pnpm exec vitest run tests
pnpm exec tsc --noEmit --incremental false
pnpm lint
git diff --check
```

A suíte focada final passou com **74 testes**. A regressão completa offline passou com **121 testes**, incluindo todos os casos de Resume/HTTP e as regressões de compensação. Os 4 testes opt-in de PostgreSQL da Fase 1 foram ignorados; nenhum teste B2 real foi executado. Typecheck, lint completo e diff-check passaram.

Houve uma rejeição não tratada do produtor FormData do Undici ao cancelar um multipart sintético muito grande. O teste foi corrigido para fornecer os bytes serializados que chegariam da rede, preservando a proteção/cancelamento do adapter. A suíte final não teve rejeições não tratadas.

## Checklist de segurança

| Item | Situação |
| --- | --- |
| Trust boundary / inputs | Sessão confiável; body, headers, MIME, filename e ZIP são externos e não confiáveis. |
| Validação / limites | MIME e assinatura, tamanho de arquivo/corpo, deadline, estrutura ZIP e limites declarados. |
| Ownership / IDOR | Consulta por usuário da sessão + checagem explícita; testes USER/ADMIN × PDF/DOCX não alteram outro usuário. |
| Secrets / browser | Nenhuma credencial nova; resposta seleciona metadados públicos e não storageKey. |
| Logs | Upload/compensação logam somente mensagens fixas. Nenhum payload ou erro raw. |
| Integrações / timeout | Storage B2 existente preservado; leitura HTTP limitada a 20s. Timeout explícito de operações B2 permanece dívida operacional. |
| SSRF / execução | Sem fetch de URL do cliente, shell, extração em filesystem ou execução de conteúdo. |
| XSS | Conteúdo não é renderizado; nenhuma nova UI/download inline. Filename permanece texto não confiável para futura UI. |
| Mass assignment | Input do caso de uso mapeado explicitamente; userId e storageKey são server-side. |
| Concorrência / idempotência | Um Resume por userId via constraint existente. Upload não tem chave de idempotência; repetição cria objeto novo. Ver dívidas abaixo. |
| Erros / negativos | 400/401/403/429/500 controlados; ZIP malformado, limites, timeout e falhas duplas testados. |
| ADMIN | Role não cria exceção de ownership; utiliza a autenticação normal da Fase 1. |

Busca por padrões de secrets nos arquivos desta fase não encontrou segredo potencialmente real. `.env`/credenciais/chaves privadas não estão versionados; os arquivos de configuração da Fase 1 foram preservados.

## Riscos e dívidas restantes

- **Integridade de documentos:** a validação é estrutural mínima do contêiner. Não recalcula CRC, não valida payload Deflate/XML, relacionamentos OPC, macro/embedded content, antivírus ou semântica OOXML. Entries mínimas não provam um documento íntegro. PDF permanece validado pela assinatura, sem parser estrutural completo. Nada é executado ou servido inline nesta fase.
- **Extração futura:** impor limites sobre bytes realmente extraídos, quantidade e razão de compressão, validar XML sem entidades externas/expansão, CRC e relacionamentos; nunca confiar somente nos limites declarados atuais.
- **Compatibilidade:** ZIP64, multidisk, encryption e métodos fora de 0/8 são recusados; contêineres DOCX não usuais podem ser rejeitados na alpha.
- **Concorrência/replay:** duas criações simultâneas podem produzir conflito na unique constraint com compensação; substituições simultâneas têm comportamento de última gravação e podem deixar objeto intermediário órfão. Não foi introduzida idempotency key, CAS ou lock distribuído. GC de 24h permanece previsto para fase própria.
- **Rate limit:** local/best-effort; necessita reavaliação para múltiplas instâncias e alta cardinalidade. Sem Redis ou infraestrutura extra nesta fase.
- **Recursos:** limite é por request; várias requisições simultâneas ainda consomem memória/CPU. O host/proxy deve aplicar limites de conexões/payload/timeouts também, inclusive antes da autenticação.
- **B2:** política privada/least privilege precisa de revisão no ambiente de deploy; explicitar timeout/retry de operações externas no hardening operacional. Não foi feita auditoria remota ou alteração de storage.

Fase 2 encerrada. Nenhum Profile/Preferences, collector, LLM, scheduler ou deploy implementado.
