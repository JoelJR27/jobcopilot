# Fase 1 — roles + seed

Data: 2026-10-07. Escopo encerrado nesta fase; nenhuma fase seguinte iniciada.

## Estado encontrado e decisões

O projeto já implementava cadastro, login, logout, sessões no banco e upload de currículo. Não havia role no User, guard administrativo, seed ou migration correspondente.

Foi preservada a aplicação Next.js 16 full-stack, Prisma 7, Zod v4, bcrypt, ports e composition. USER e ADMIN usam a mesma autenticação e o mesmo upload. ADMIN recebe uma permissão adicional, sem acesso implícito a recursos privados de terceiros.

A migration é aditiva: cria o enum e adiciona `User.role` com default USER. Contas existentes permanecem USER. O cadastro também fixa USER no adapter de persistência, mesmo se receber propriedades extras em runtime.

`requireAdminUser()` consulta o usuário pela sessão e exige exatamente ADMIN. O erro de ausência de autenticação continua sendo `UnauthorizedError`; falta de permissão usa `ForbiddenError`. Os futuros adapters administrativos deverão mapear esses erros para 401/403. Esta fase não cria `/admin`.

O seed usa envs exclusivas, normaliza e valida email, valida senha de 8 a 72 bytes e exige maiúscula, número e caractere especial. O hash usa bcrypt com 12 rounds. O upsert por email nunca inclui senha no update. Promoção e revogação das sessões desse usuário ocorrem na mesma transação. Não há transação aberta durante hashing ou integração externa.

O seed executa pelo Node 24 sem novas dependências. `importFileExtension = "ts"` no gerador e `allowImportingTsExtensions` no TypeScript permitem os imports explícitos do entrypoint/composition, conforme a [documentação do gerador Prisma 7](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators).

Nos handlers de autenticação alterados, respostas selecionam somente campos públicos, login e `/me` usam `no-store`, erros inesperados usam logs fixos sem exception raw, JSON malformado retorna 400 e conflito de cadastro retorna 409 pelo erro de aplicação.

## Arquivos criados

- `.env.example`
- `domain/auth/user-role.ts`
- `shared/errors/forbidden-error.ts`
- `shared/config/seed-admin-env.ts`
- `application/auth/ports/admin-seed-repository.ts`
- `application/auth/seed-admin.ts`
- `infrastructure/auth/session/require-admin-user.ts`
- `infrastructure/database/prisma/repositories/admin-seed-repository.ts`
- `infrastructure/composition/admin-seed.ts`
- `prisma/seed.ts`
- `prisma/migrations/20261007000000_add_user_role/migration.sql`
- `tests/application/auth/roles.test.ts`
- `tests/application/auth/seed-admin.test.ts`
- `tests/application/auth/seed-cli.test.ts`
- `tests/infrastructure/auth/authorization.test.ts`
- `tests/infrastructure/database/user-repository.test.ts`
- `tests/infrastructure/database/admin-seed-repository.test.ts`
- `tests/app/api/auth/roles.test.ts`
- `tests/integration/auth-roles.test.ts`
- `docs/PHASE_1_REPORT.md`

## Arquivos atualizados

- `.gitignore`
- `prisma/schema.prisma`
- `prisma7.config.ts`
- `package.json`
- `tsconfig.json`
- `application/auth/ports/user-repository.ts`
- `application/auth/get-current-user.ts`
- `application/auth/login-user.ts`
- `infrastructure/database/prisma/repositories/user-repository.ts`
- `app/api/auth/register/route.ts`
- `app/api/auth/login/route.ts`
- `app/api/auth/me/route.ts`
- `tests/app/api/resumes/route.test.ts`
- `docs/CODEX_HANDOFF.md`

O Prisma Client em `generated/prisma` foi regenerado, permanece ignorado no Git. Lockfile e dependências não foram alterados. Os documentos de produção/segurança fornecidos pelo usuário foram preservados.

## Verificação executada

Na raiz do repositório:

```powershell
pnpm exec prisma generate --config prisma7.config.ts
pnpm exec prisma validate --config prisma7.config.ts
pnpm exec vitest run tests
pnpm exec tsc --noEmit --incremental false
pnpm lint
git diff --check
```

Resultado: Prisma Client 7.10.0 gerado; schema válido; 78 testes passaram; os 4 testes de PostgreSQL são ignorados no comando offline; typecheck, lint completo e diff-check passaram.

Integração executada separadamente:

```powershell
$env:JOBCOPILOT_DB_TESTS = '1'
pnpm exec vitest run tests/integration/auth-roles.test.ts
Remove-Item Env:JOBCOPILOT_DB_TESTS
```

Os 4 testes passaram contra PostgreSQL local, aplicando as migrations anteriores e a nova em um schema temporário depois removido. Cobrem default de contas anteriores/novas, seed repetido, preservação de senha, revogação isolada de sessões e seed concorrente. As tabelas normais não foram migradas nem receberam bootstrap.

Os testes offline cobrem guard server-side, USER/ADMIN no fluxo comum, sessão inválida, role desconhecida/revogada, falha fechada, cadastro/login com role forjada, minimização de respostas/logs, Node executando a composição sem runner adicional e upload de USER/ADMIN sem afetar currículo de outro usuário.

Os testes B2 existentes não foram executados: não são relacionados à mudança e acessam armazenamento real. Build/deploy e smoke de produção pertencem às fases posteriores.

## Checklist de segurança da feature

| Item do guia | Resultado nesta fase |
| --- | --- |
| 1. Trust boundary | Sessão validada no servidor → usuário do banco → autorização. Seed é CLI de bootstrap confiável, sem HTTP. |
| 2. Inputs externos | Credenciais/campos do cadastro/login, cookie de sessão e envs do seed. Role do cliente não é usada. |
| 3. Validação | Zod v4/PT-BR; schemas de auth existentes; email/senha do seed limitados; JSON malformado controlado. |
| 4. Ownership | Identidade autenticada deriva da sessão; promoção visa somente email configurado no bootstrap. |
| 5. IDOR | Auth não consulta IDs enviados no body; upload cross-user testado para USER e ADMIN. |
| 6. Secrets | Senha de seed, hash e DB URL apenas server-side; sem valores reais em novos arquivos. |
| 7. Browser | Respostas de auth mapeiam id/email/role; nenhum hash, token ou sessionId em JSON. Cookie de sessão continua no mecanismo HttpOnly existente. |
| 8. Logs pessoais | CLI/logs HTTP alterados usam mensagens fixas sem email, senha, hash, erro raw ou payload. |
| 9. Chamada externa | Nenhum provider HTTP/LLM/B2 adicionado; seed acessa somente PostgreSQL configurado. |
| 10. Timeout | Seed: conexão 5s, espera de transação 5s, transação 10s. |
| 11. Limites | Email do seed até 254 caracteres; senha até 72 bytes e bcrypt 12 rounds. Limites gerais de auth são trabalho posterior. |
| 12. SSRF | Sem fetch de URL de usuário; DATABASE_URL é configuração server-only de deployment. |
| 13. XSS | Sem UI/HTML externo novo; respostas são JSON. |
| 14. Mass assignment | Cadastro seleciona email/hash e fixa USER; seed mapeia campos e update apenas de role. |
| 15. Concorrência | Constraint única de email + upsert; promoção/revogação em transação; execução concorrente testada em PostgreSQL. |
| 16. Idempotência | Seed não duplica usuário, não troca senha e não revoga sessões de ADMIN em execuções posteriores. |
| 17. Internals | Erros HTTP/CLI controlados; nenhuma exception raw nos novos logs. |
| 18. Testes negativos | Sessões ausentes/inválidas, role desconhecida/revogada, inputs inválidos, JSON inválido, falhas DB e tentativa de role forjada. |
| 19. Cross-user | Sessão A resolve apenas A; upload de USER/ADMIN não altera B; promoção não revoga sessões de B. |
| 20. ADMIN server-side | `requireAdminUser()` exige role do banco e falha fechado. Rota `/admin` será criada na fase prevista. |

Verificação de secrets: nenhum arquivo `.env`, chave privada ou arquivo de credenciais está versionado; `.env` continua ignorado e `.env.example` está liberado com valores vazios. A busca por padrões de tokens/chaves/URLs com credenciais nos arquivos versionados e histórico recente não encontrou segredo potencialmente real. Isso não substitui auditoria completa antes do deploy.

## Bootstrap e pendências

Após configurar envs no ambiente pretendido, execute na raiz:

```powershell
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
```

É obrigatório aplicar a migration antes de usar o app atualizado com um banco antigo. O seed não roda no boot; uma promoção força novo login. Envs exclusivas do seed não bloqueiam runtime normal.

Não houve deploy nesta fase. A aplicação completa ainda não está pronta para usuários externos. Conforme o roadmap, permanecem hardening de login/registro (rate limit, payload, CSRF), validação estrutural DOCX, limitações do limiter de upload local, revisão dos logs antigos fora dos handlers alterados, demais recursos multiusuário e os gates de build/deploy/smoke. Esses itens devem ser revisados nas próximas fases, sem considerar a conclusão de roles como aprovação de produção.
