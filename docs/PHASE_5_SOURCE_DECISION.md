# Fonte brasileira — decisão anterior à implementação

Consulta em 2026-10-07. Adzuna foi a primeira candidata: [API](https://developer.adzuna.com/overview), [busca](https://developer.adzuna.com/docs/search), [referência](https://developer.adzuna.com/activedocs/), [termos](https://developer.adzuna.com/docs/terms_of_service). Exige app_id/app_key; nenhuma credencial está configurada. Publicação exige atribuição; outros usos contínuos podem exigir consentimento/licença após trial. Não presumimos plano/chave aprovados para este produto. Não implementaremos acesso sem credenciais nem assumiremos licença gratuita irrestrita.

Gupy descartada: [autenticação](https://developers.gupy.io/docs/autentica%C3%A7%C3%A3o) requer plano/token do cliente empresarial; [escopo/permissões](https://developers.gupy.io/v2.0/docs/autentica%C3%A7%C3%A3o-recrutamento-sele%C3%A7%C3%A3o) não equivale a agregador aberto.

Alternativa escolhida: **CI&T / Lever Postings API**, uma empresa com forte cobertura brasileira, não agregador nacional. Endpoint fixo HTTPS `https://api.lever.co/v0/postings/ciandt?mode=json`. [Documentação oficial](https://github.com/lever/postings-api) descreve API para vagas publicadas, acesso público e uso por terceiros; [suporte oficial](https://hire.lever.co/developer/support), [termos](https://www.lever.co/legal/terms-of-service) e [carreiras CI&T](https://ciandt.com/br/pt-br/carreiras/oportunidades) consultados. Sem contratação de Lever, autenticação, candidatura automática ou dados internos. Somente GET JSON e links ao anúncio original, sem scraping. A disponibilidade pública não concede licença geral sobre marcas/dados privados; manter atribuição e reavaliar alterações dos termos.

Verificação controlada: 206 vagas, 175 country=BR, ~3,58 MB. Nubank/Greenhouse e CloudWalk/Lever foram verificados, mas os endpoints retornaram zero vagas; não foram implementados. CI&T é a única nova fonte. Arbeitnow e seus registros permanecem separados.

Limitação: cobertura de um empregador, principalmente tecnologia. Adzuna/br pode ser reavaliada quando houver credencial/plano autorizados, sem substituir fontes silenciosamente.
