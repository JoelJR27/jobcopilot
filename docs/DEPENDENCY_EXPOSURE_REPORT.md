# Exposição de dependências — Fase 7

Verificado em 2026-10-08. Prisma permanece **7.10.0**, versão 7 mais recente retornada pelo registry nesta revisão. Next permanece 16.3.8. Nenhum override, Prisma 8 ou dependência direta artificial foi introduzido.

## Atualizações compatíveis

`pnpm up --depth 10 lodash mysql2 fast-uri` respeitou os intervalos dos consumidores: lodash **4.17.21 → 4.18.1**, fast-uri **3.1.7 → 3.1.8**. Quatro advisories desapareceram: [lodash template imports](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [lodash array unset](https://github.com/advisories/GHSA-f23m-r3pf-42rh), [lodash prototype pollution](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg), [fast-uri normalization](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj). mysql2 está fixado em 3.15.3 pelo pacote Prisma e não foi alterado silenciosamente.

## Resultado e aceitação restrita

`pnpm audit --prod`: **zero críticos, dois altos e um moderado; exit 1**. Audit considera o peer CLI Prisma alcançável por @prisma/client; a árvore instalada não equivale à superfície HTTP implantada.

| Pacote instalado | Advisory / severidade | Correção publicada | Cadeia / exposição aceita |
| --- | --- | --- | --- |
| deepmerge-ts 7.1.5 | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), alto | ≥8.0.0 | @prisma/client → prisma → @prisma/config. Merge de configuração CLI; não importado pela aplicação HTTP. Upgrade major não forçado. |
| mysql2 3.15.3 | [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), alto | ≥3.22.0 | @prisma/client → prisma → mysql2. Driver do tooling; runtime e migrations deste projeto usam PostgreSQL. Não há conexão MySQL. |
| mysql2 3.15.3 | [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), moderado | ≥3.23.1 | Mesmo caminho. Protocolo MySQL comprimido não é utilizado. |

## Evidência do build real

Next `output: standalone` habilitado para gerar artefato inspecionável. `pnpm backend:exposure` lê todos os manifests `.next/server/**/*.nft.json` e os arquivos realmente copiados em `.next/standalone`. Build final: **22 traces, 551 arquivos distintos referenciados, 1750 arquivos standalone sanitizados**; zero arquivos de lodash/deepmerge-ts/mysql2/fast-uri nos dois conjuntos. O script falha se qualquer desses pacotes entrar no artefato, exigindo nova revisão. Não é apenas uma classificação nominal de devDependency.

Next copia `.env` para standalone por padrão, confirmado no código instalado de build. Essa cópia local foi encontrada e removida: `pnpm build` agora finaliza removendo arquivos env exclusivamente do artefato, e o gate verifica ausência de `.env*`/valores de secrets locais embutidos em JS/JSON/HTML. Vercel usa explicitamente esse buildCommand. Nenhum artefato foi publicado; `.env` original permanece ignorada. Recomenda-se rotação B2 antes do deploy, sem reproduzir credenciais.

Prisma gerado utiliza runtime client + adapter PostgreSQL. `prisma7.config.ts`, migrations/Studio e configuração CLI não são importados por Route Handlers; não executamos Prisma CLI/Studio por HTTP nem passamos feed/currículo/payload de usuário como configuração CLI. Jobs CLI também chama o mesmo application use case, sem executar CLI Prisma sobre conteúdo externo.

Aceitação dos três avisos é **somente para tooling instalado**, baseada na ausência dos pacotes vulneráveis no artefato e no uso PostgreSQL. Não significa audit limpo nem ausência universal de vulnerabilidades. Não publicar node_modules completo/Studio como servidor do produto; executar migrations em ambiente controlado, com configuração versionada e credencial restrita, sem configuração não confiável. Repetir audit + build + exposição a cada atualização, import novo ou mudança no empacotamento. Inspecionar também os manifests reais gerados pela Vercel antes de abrir produção; não houve deploy remoto nesta fase.

O alerta de suporte do ESLint 9 permanece dívida de tooling; não há migração major cosmética nesta fase.
