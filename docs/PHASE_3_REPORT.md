# Profile + Preferences — dados profissionais para matching

Data: 2026-10-07. O usuário autorizou explicitamente Profile e Preferences juntos (Fases 3 e 4 do roadmap), solicitando este relatório como PHASE_3_REPORT. Não foram implementados onboarding, collector, matching ou extração automática do currículo. Fases 1/2 e suas decisões foram preservadas.

## Inspeção e escopo mínimo

Os seis documentos solicitados foram lidos integralmente. A inspeção confirmou modelos Profile/Preference existentes com userId único, JSON para campos flexíveis e todas as colunas necessárias. Foram conferidos repositories, composição, auth helpers, handlers, testes e UI atual. Não havia fluxo Profile/Preferences nem formulário existente.

Foram adicionados dois ports, quatro casos de uso, dois repositories Prisma e duas composições, duas APIs e duas páginas dinâmicas. Schemas e componentes compartilhados são limitados aos dados profissionais; não foi criado framework, nova entidade, migration, dependência ou infraestrutura.

## Contrato e validação

`GET /api/profile` retorna `{ profile: null }` se inexistente; caso contrário, somente os oito campos profissionais. `GET /api/preferences` retorna `{ preferences: null }` ou os cinco campos editáveis. Status 200.

PUT cria/atualiza atomicamente por userId da sessão e retorna 200 com o mesmo envelope. PUT substitui todos os campos editáveis; opcionais omitidos viram texto/listas vazios. Campos desconhecidos (incluindo userId/id/role/owner/timestamps) são descartados pelo schema e não controlam ownership.

Arrays JSON são listas de strings simples, nunca objetos aninhados arbitrários. Experiências/formação/idiomas usam descrições manuais, um item por linha. Strings são aparadas; itens vazios são rejeitados na API; duplicatas exatas são removidas após validar cardinalidade. A UI ignora linhas em branco. Não há interpretação HTML.

| Campo | Limites / requisito |
| --- | --- |
| headline | 1–160 caracteres, obrigatório |
| summary | até 4000 caracteres; opcional |
| skills | 1–50 itens, até 80 caracteres/item |
| experiences | até 20 itens, 1000 caracteres/item |
| education | até 20 itens, 500 caracteres/item |
| languages | até 20 itens, 80 caracteres/item |
| roles | 1–20 itens, 100 caracteres/item |
| desiredRoles | 1–20 itens, 100 caracteres/item |
| desiredSkills | até 50 itens, 80 caracteres/item |
| locations | até 20 itens, 120 caracteres/item; pelo menos 1 para HYBRID/ONSITE |
| seniority | INTERN, JUNIOR, MID, SENIOR ou LEAD, obrigatório |
| workModels | 1–3 valores de REMOTE/HYBRID/ONSITE |

O limite global de body prevalece mesmo quando limites de campos individuais estão satisfeitos: **64 KiB de bytes reais**, independentemente de Content-Length, com deadline de leitura de **10 segundos**. A API aceita application/json; JSON malformado, UTF-8 inválido, body excessivo e inputs fora do schema retornam 400 controlado.

Validação utiliza Zod v4 com `error` em PT-BR. A regra condicional de localização usa `context.addIssue({ message })`, pois esta é a propriedade exigida pela API de issues do Zod, não a convenção antiga de mensagens em schemas.

## Ownership e segurança

Todos os handlers autenticam primeiro. A única identidade passada ao caso de uso é `user.id`. GET não interpreta query params de identidade; PUT não passa body cru ao repository. SQL/Prisma usam where único por userId e upsert com create/update mapeados explicitamente. Não há lookup por ID fornecido pelo cliente nem endpoints de terceiros para ADMIN.

Seleção Prisma e validação de saída dos casos de uso limitam respostas a campos profissionais; não retornam id, userId, timestamps, hashes, credenciais, sessionId ou storageKey. Todos os status de resposta usam `Cache-Control: no-store`.

PUT rejeita Origin diferente da origem da URL do request, Origin null e Sec-Fetch-Site cross-site antes de ler o body. Mantém o mecanismo de cookies/SameSite da Fase 1, sem CORS permissivo. Requests sem Origin continuam permitidos para clientes não browser que já possuam sessão válida; identidade nunca é determinada por esses headers.

Erros inesperados retornam 500 genérico e logs fixos sem exception raw ou dados profissionais. Não há fetch externo, shell, parser de currículo, LLM ou renderização de HTML externo. JSON não é mesclado em config; só campos allowlisted são persistidos.

## UI

`/profile` e `/preferences` exigem autenticação server-side e são explicitamente dinâmicas. Não há dados profissionais em props do servidor; formulários leem APIs same-origin sem cache. Sem sessão, páginas mostram mensagem controlada pedindo login, sem exibir formulário. A UI de login ainda pertence ao roadmap próprio e não foi adicionada.

Formulários simples com inputs/textarea/select/checkboxes acessíveis, labels, limites, navegação entre as duas páginas, loading, erro com recarga, botão desabilitado ao salvar e feedback de sucesso. Dados externos são texto/valores de formulário escapados pelo React. Não há HTML raw, wizard ou design system.

Uma falha inicial no GET não permite editar/salvar estado vazio: o editor só é habilitado depois de carregar registro ou confirmar ausência. Requests do browser têm timeout de 15s. Respostas inesperadas e erros de decodificação geram mensagem genérica; a UI não exibe exceptions raw.

## Arquivos criados

- `shared/validation/professional-fields.ts`
- `domain/profile/profile.ts`
- `domain/preferences/preferences.ts`
- `application/profile/ports/profile-repository.ts`
- `application/profile/get-profile.ts`
- `application/profile/upsert-profile.ts`
- `application/preferences/ports/preference-repository.ts`
- `application/preferences/get-preferences.ts`
- `application/preferences/upsert-preferences.ts`
- `infrastructure/database/prisma/repositories/profile-repository.ts`
- `infrastructure/database/prisma/repositories/preference-repository.ts`
- `infrastructure/composition/profile.ts`
- `infrastructure/composition/preferences.ts`
- `infrastructure/http/account-data.ts`
- `app/api/profile/route.ts`
- `app/api/preferences/route.ts`
- `app/profile/page.tsx`
- `app/preferences/page.tsx`
- `features/account/use-account-editor.ts`
- `features/account/editor-fields.tsx`
- `features/profile/profile-editor.tsx`
- `features/preferences/preferences-editor.tsx`
- `tests/fixtures/professional-data.ts`
- `tests/app/api/professional-data.test.ts`
- `tests/infrastructure/http/account-data.test.ts`
- `tests/infrastructure/database/professional-repositories.test.ts`
- `tests/features/professional-pages.test.tsx`
- `tests/integration/professional-data.test.ts`
- `docs/PHASE_3_REPORT.md`

Atualizado: `docs/CODEX_HANDOFF.md`. Demais mudanças pré-existentes das Fases 1/2 no working tree foram preservadas, sem refatoração.

## Testes e resultados

Comandos na raiz (na sessão PowerShell foi usado pnpm.cmd, o executável da mesma CLI):

```powershell
pnpm exec vitest run tests/app/api/professional-data.test.ts tests/infrastructure/http/account-data.test.ts tests/infrastructure/database/professional-repositories.test.ts tests/features/professional-pages.test.tsx
$env:JOBCOPILOT_DB_TESTS = '1'
pnpm exec vitest run tests/integration/professional-data.test.ts
pnpm test
Remove-Item Env:JOBCOPILOT_DB_TESTS
pnpm exec tsc --noEmit --incremental false
pnpm lint
pnpm build
git diff --check
```

- **86 testes focados passaram**: 401 GET/PUT, GET null, upsert/atualização/repetição, arrays e strings acima de limites, JSON inválido, content type, bytes reais/Content-Length forjado, deadline/UTF-8, CSRF, USER/ADMIN × ownership, campos internos excluídos, 500/logs seguros, guards de páginas, loading/navegação e escape de HTML em textarea.
- **3 testes PostgreSQL passaram**, usando todos os modelos/migrations existentes em schema local temporário depois removido. Confirmaram isolamento, upsert repetido/concorrente sem duplicação e persistência JSON dos workModels. As tabelas normais não foram alteradas.
- **Suíte completa: 217 testes / 20 arquivos passaram**, incluindo os 7 testes PostgreSQL e os 3 testes B2 existentes, sem skips. A primeira tentativa teve somente 3 falhas B2 por EACCES do sandbox; repetição autorizada fora dele passou integralmente. Os testes externos B2 operam no prefixo tests/ conforme implementação existente.
- **Typecheck, lint completo, build e diff-check passaram.** Build classificou APIs e páginas profissionais como dinâmicas. Build não constitui deploy.

Testes de UI são de renderização server-side e segurança dos campos; não houve automação interativa em navegador nesta sessão. Estados e handlers de load/save foram implementados, mas smoke manual/interativo permanece recomendado.

## Checklist de segurança

| Item do guia | Resultado |
| --- | --- |
| 1. Trust boundary | Sessão validada → user.id → casos de uso; JSON e dados persistidos passam por schema. |
| 2. Inputs externos | Cookie, headers, JSON e textos digitados; identidade/role do body são ignorados. |
| 3. Validação | Zod v4/PT-BR, enums, listas rasas, limites por campo e body. |
| 4. Ownership | GET e upsert exclusivamente por userId da sessão. |
| 5. IDOR | Sem acesso por ID do cliente; testes query/body de B não afetam B. |
| 6. Secrets | Nenhum secret novo ou hardcoded; nenhuma env pública adicionada. |
| 7. Browser | Somente campos profissionais necessários do próprio usuário, sem IDs/hash/tokens. |
| 8. Logs pessoais | Mensagens fixas; testes verificam ausência de PII/exception raw. |
| 9. Chamada externa | Feature só usa PostgreSQL já existente e fetch same-origin no client. B2 foi executado apenas pela suíte completa. |
| 10. Timeout | Body server 10s e fetch client 15s; query timeout global do DB continua operacional. |
| 11. Limite de tamanho | Body 64 KiB e strings/arrays limitados; sem JSON arbitrário aninhado. |
| 12. SSRF | Sem fetch server de URL recebida; endpoints client são constantes. |
| 13. XSS | React escapa valores; sem dangerouslySetInnerHTML; teste com tag script. |
| 14. Mass assignment | Schema remove campos extras e repository reconstrói create/update allowlisted. |
| 15. Race condition | Upsert atômico e userId único; concorrência testada em PostgreSQL. |
| 16. Idempotência | PUT repetido não cria outro registro; conteúdo final é igual, updatedAt pode mudar. |
| 17. Erros / internals | 400/401/403/500 controlados, todos no-store; sem erros brutos. |
| 18. Negativos | Inputs/limites, body malformado, UTF-8, timeout, origin, falha DB, sem sessão. |
| 19. Cross-user | USER A e ADMIN usam somente próprios dados; USER B permanece inalterado. |
| 20. ADMIN | Fluxos normais exigem sessão igual a USER; nenhum privilégio administrativo novo. |

Busca de padrões de tokens/chaves privadas/secrets em NEXT_PUBLIC nos novos arquivos não encontrou segredo potencialmente real. A inspeção dos fixtures confirmou conteúdo sintético e endereços example.com; nenhum arquivo .env, credencial ou secret foi adicionado à fase. Essa busca não substitui a auditoria completa de produção.

## Dívidas técnicas / limites da entrega

- Não houve teste interativo real em navegador de edição, recarga e salvamento. As telas foram compiladas e verificadas por SSR; APIs e persistência foram testadas independentemente.
- PUT é substituição completa: várias abas/requests concorrentes têm última gravação como resultado, sem versionamento/CAS. Upsert impede duplicação e acesso a outro owner, mas não evita perda de edição concorrente.
- Senioridade agora tem enum de aplicação em coluna String; experiências/formação/idiomas são listas de descrições simples. Matching futuro deverá consumir esse contrato ou migrá-lo explicitamente, sem aceitar JSON arbitrário.
- Rows previamente inseridas fora deste fluxo que não satisfaçam o schema retornam 500 controlado; não foi feita migração/normalização de dados legados. Os fluxos anteriores não gravavam Profile/Preference.
- Campos mínimos garantem dados estruturados para matching, sem validar veracidade ou qualidade semântica das informações.
- Limites de conexões, rate limiting global, timeout/statement timeout do DB e demais gates de produção continuam nas fases de hardening/deploy. Novos endpoints não chamam LLM nem processamento caro.
- A migration de roles da Fase 1 continua necessária no banco utilizado em runtime, conforme handoff anterior; não foi reaplicada nas tabelas normais nesta etapa.

Onboarding/collector/matching não iniciados.
