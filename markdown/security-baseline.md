# Security Baseline — JobCopilot MVP

> **Projeto:** JobCopilot
> **Escopo:** MVP de validação
> **Versão:** 1.0
> **Status:** Definição inicial
> **Objetivo:** Estabelecer os requisitos mínimos de segurança que devem ser observados durante a implementação do MVP.

---

## 1. Objetivo

Este documento define a linha de base de segurança do JobCopilot MVP.

O objetivo não é construir uma infraestrutura de segurança de nível empresarial neste momento, mas garantir que o MVP seja desenvolvido de forma segura o suficiente para:

* proteger as contas dos usuários;
* impedir acesso indevido aos dados de outros usuários;
* proteger currículos e demais dados pessoais;
* reduzir riscos relacionados ao processamento por LLM;
* proteger integrações externas;
* evitar abuso que inviabilize a validação do produto;
* estabelecer fundamentos que permitam evolução futura.

A segurança deve ser aplicada sem introduzir complexidade desnecessária ao MVP.

---

# 2. Princípios de segurança

## SEC-000 — Nenhuma entrada externa deve ser considerada confiável

O sistema deve considerar como não confiáveis:

* dados enviados pelo usuário;
* arquivos enviados pelo usuário;
* conteúdo de vagas;
* conteúdo retornado por fontes externas;
* respostas produzidas por LLMs;
* URLs externas;
* parâmetros recebidos do frontend.

Toda entrada deve ser validada antes de ser utilizada.

---

## SEC-001 — Princípio do menor privilégio

Cada componente deve possuir apenas os acessos necessários para executar sua função.

Exemplos:

* frontend não possui credenciais do banco;
* frontend não possui API key do LLM;
* usuário não acessa diretamente o banco;
* processamento de vagas não deve possuir acesso desnecessário a dados privados do usuário;
* arquivos de currículo não devem ser públicos.

---

## SEC-002 — Server-side como fronteira de confiança

Operações sensíveis devem ocorrer exclusivamente no ambiente server-side.

Isso inclui:

* acesso ao banco;
* autenticação;
* autorização;
* chamadas ao LLM;
* processamento de currículo;
* execução da coleta de vagas;
* cálculo de matching;
* acesso a secrets.

O cliente nunca deve ser considerado uma fonte confiável para essas operações.

---

# 3. Autenticação

## SEC-003 — Senhas nunca podem ser armazenadas em texto puro

Senhas devem ser armazenadas utilizando algoritmo de hash apropriado para senhas, como Argon2id ou bcrypt.

O sistema nunca deve persistir:

```text
password
senha
senha descriptografável
```

em texto puro.

---

## SEC-004 — Credenciais não devem ser retornadas pela API

Endpoints de usuário jamais devem retornar:

* password hash;
* tokens internos;
* secrets;
* credenciais;
* informações de autenticação desnecessárias.

---

## SEC-005 — Mensagens de autenticação não devem revelar informações sensíveis

Mensagens de erro de login não devem permitir descobrir facilmente se um determinado email possui conta.

Evitar respostas como:

```text
Email não cadastrado.
```

ou:

```text
Senha incorreta.
```

Preferir mensagens genéricas.

---

## SEC-006 — Login deve possuir proteção contra abuso

O endpoint de autenticação deve possuir mecanismos de rate limiting.

O objetivo é reduzir:

* brute force;
* credential stuffing;
* abuso automatizado.

Os limites iniciais podem ser simples e ajustados posteriormente.

---

# 4. Sessão

## SEC-007 — Sessão deve ser protegida

Quando a autenticação utilizar cookies, estes devem possuir, quando aplicável:

```text
HttpOnly
Secure
SameSite
```

O cookie de sessão não deve ser acessível por JavaScript no navegador quando isso não for necessário.

---

## SEC-008 — Logout deve invalidar a sessão

O logout deve invalidar a sessão no servidor ou tornar o mecanismo de autenticação previamente emitido inutilizável.

---

## SEC-009 — Sessões devem expirar

Sessões não devem permanecer válidas indefinidamente.

Devem existir tempos de expiração apropriados para o MVP.

---

# 5. Autorização

## SEC-010 — Autenticação não substitui autorização

Estar autenticado não significa possuir acesso a qualquer recurso.

Toda operação sobre um recurso privado deve verificar sua propriedade.

Exemplo conceitual:

```text
sessão.userId === resource.userId
```

---

## SEC-011 — Proteção contra IDOR / Broken Access Control

Nenhum usuário pode acessar recursos de outro usuário simplesmente alterando um identificador.

Exemplo proibido:

```http
GET /api/resumes/123
```

trocar:

```text
123 → 124
```

e receber o currículo de outra pessoa.

Essa validação deve ocorrer no servidor.

Aplicar a:

* currículo;
* perfil;
* preferências;
* matches;
* feedback;
* quaisquer outros recursos privados.

---

## SEC-012 — O frontend nunca é responsável pela autorização

Esconder um botão ou filtrar dados no frontend não constitui proteção.

A autorização precisa ser validada no backend/server-side.

---

# 6. Upload de currículo

O currículo representa uma das superfícies de ataque mais importantes do MVP.

## SEC-013 — Extensões permitidas devem ser restritas

Inicialmente, aceitar somente formatos necessários ao produto.

Exemplo:

```text
PDF
DOCX
```

Qualquer outro formato deve ser rejeitado.

---

## SEC-014 — Validar o arquivo real

Não confiar apenas em:

```text
Content-Type
extensão fornecida pelo cliente
nome do arquivo
```

O arquivo deve ser validado também por seu conteúdo/assinatura quando possível.

---

## SEC-015 — Limitar tamanho dos arquivos

Deve existir um tamanho máximo para upload.

Isso reduz risco de:

* denial of service;
* consumo excessivo de memória;
* armazenamento abusivo;
* processamento excessivo.

---

## SEC-016 — O nome do arquivo não deve ser controlado diretamente pelo usuário

O armazenamento deve utilizar identificadores gerados pelo servidor.

Exemplo:

```text
<uuid>.pdf
```

em vez de confiar em:

```text
curriculo-do-joao-final-final-2.pdf
```

como identificador de armazenamento.

---

## SEC-017 — Arquivos devem possuir armazenamento privado

Currículos não devem ser armazenados como arquivos públicos.

O acesso deve exigir autorização.

---

## SEC-018 — O conteúdo do currículo deve ser tratado como não confiável

Mesmo sendo PDF/DOCX válido, seu conteúdo pode conter texto malicioso ou instruções destinadas a manipular sistemas de IA.

---

# 7. Processamento de currículo com LLM

## SEC-019 — Currículo é conteúdo não confiável para o LLM

O conteúdo extraído do currículo nunca deve ser tratado como instrução do sistema.

Conceitualmente:

```text
INSTRUÇÕES DO SISTEMA
+
DADOS NÃO CONFIÁVEIS DO CURRÍCULO
```

A aplicação deve deixar clara essa separação.

---

## SEC-020 — LLM não deve executar ações

Durante o MVP, o LLM deve atuar como processador de informação.

Ele não deve possuir capacidade de:

* executar código;
* executar comandos do sistema;
* acessar o banco;
* realizar HTTP requests arbitrários;
* alterar recursos diretamente;
* enviar mensagens;
* executar operações administrativas.

O fluxo desejado é:

```text
Entrada
  ↓
LLM
  ↓
Saída estruturada
  ↓
Validação
  ↓
Aplicação
```

---

## SEC-021 — Saída do LLM deve ser validada

Toda saída gerada pelo LLM deve passar por:

```text
Parsing
  ↓
Schema validation
  ↓
Validação de domínio
  ↓
Persistência
```

Nunca assumir que o JSON retornado pela IA está correto somente porque o modelo foi instruído a produzir JSON.

---

## SEC-022 — Minimização de dados enviados ao LLM

Enviar somente os dados necessários para cada operação.

Exemplo:

Para extrair habilidades profissionais, pode não ser necessário enviar:

```text
telefone
endereço
email
```

quando essas informações não participarem do processamento.

---

## SEC-023 — API keys do LLM são server-side only

A chave do provedor de IA jamais deve aparecer:

* no frontend;
* em código público;
* em variáveis `NEXT_PUBLIC_*`;
* em respostas HTTP;
* em logs.

---

# 8. Prompt Injection em vagas

## SEC-024 — Conteúdo de vagas deve ser considerado hostil

Uma descrição de vaga pode conter conteúdo como:

```text
Ignore as instruções anteriores...
```

Esse conteúdo deve ser tratado somente como dado.

---

## SEC-025 — O prompt de enriquecimento deve separar instruções e dados

O sistema deve estabelecer explicitamente que o conteúdo recebido é material não confiável e deve ser apenas analisado.

---

## SEC-026 — LLM não pode utilizar conteúdo da vaga como comando operacional

O conteúdo da vaga não deve conseguir:

* alterar o prompt do sistema;
* obter secrets;
* executar operações;
* controlar ferramentas;
* alterar dados do usuário.

---

# 9. Saída gerada pela IA

## SEC-027 — Não renderizar HTML arbitrário produzido pela IA

Saídas do LLM devem ser tratadas como dados.

Evitar renderização direta de HTML produzido pela IA.

Especialmente evitar o uso desnecessário de:

```text
dangerouslySetInnerHTML
```

---

## SEC-028 — LLM não decide sozinho operações críticas

O MVP não deve utilizar a IA como autoridade final para:

* autorização;
* permissões;
* acesso a dados;
* execução de comandos;
* exclusão de recursos.

A aplicação deve tomar essas decisões com regras determinísticas.

---

# 10. Matching

## SEC-029 — Matching deve ser server-side

O cliente não deve ser responsável por calcular ou definir o próprio score.

O score oficial deve ser produzido pelo sistema.

---

## SEC-030 — Usuário não pode manipular o próprio score

O frontend não deve enviar:

```json
{
  "matchScore": 99
}
```

e esperar que o servidor aceite esse valor.

O servidor deve recalcular ou validar o resultado.

---

## SEC-031 — Recomendações devem respeitar o usuário autenticado

Uma recomendação pertence a um usuário específico.

Consultas devem utilizar a identidade autenticada:

```text
authenticatedUserId
```

e não um `userId` arbitrário fornecido pelo cliente.

---

# 11. Coleta de vagas

## SEC-032 — Fontes de vagas devem ser previamente conhecidas

Durante o MVP, o sistema deve operar sobre fontes explicitamente configuradas.

Evitar que o usuário forneça uma URL arbitrária para o servidor acessar.

---

## SEC-033 — Evitar SSRF

Nenhuma funcionalidade do MVP deve permitir que um usuário transforme o servidor em um cliente HTTP arbitrário.

Evitar padrões como:

```ts
fetch(userProvidedUrl)
```

sem validações extremamente rigorosas.

---

## SEC-034 — Conteúdo externo deve ser considerado não confiável

Dados coletados externamente podem conter:

* HTML malicioso;
* scripts;
* prompt injection;
* dados falsificados;
* conteúdo inesperado.

Todo conteúdo deve ser normalizado antes de chegar às demais etapas.

---

# 12. Deduplicação

## SEC-035 — Identidade da vaga deve ser validada server-side

O sistema deve utilizar identificadores controlados pela aplicação para evitar:

* duplicação;
* corrupção de registros;
* manipulação de relacionamento.

---

# 13. Banco de dados

## SEC-036 — Queries devem utilizar mecanismos parametrizados

Utilizar Prisma e consultas parametrizadas.

Evitar concatenação manual de SQL com dados externos.

Evitar, sem necessidade, mecanismos equivalentes a:

```text
raw SQL unsafe
```

---

## SEC-037 — Credenciais do banco devem permanecer privadas

A `DATABASE_URL` nunca deve ser exposta ao cliente.

---

## SEC-038 — Dados de usuários devem possuir isolamento lógico

A aplicação deve garantir que consultas privadas sempre estejam associadas ao usuário autenticado.

Exemplo:

```sql
WHERE user_id = authenticated_user_id
```

e não:

```sql
SELECT * FROM matches;
```

seguido de filtragem no frontend.

---

# 14. XSS

## SEC-039 — Dados externos devem ser escapados ao serem renderizados

Isso se aplica principalmente a:

* títulos de vagas;
* nomes de empresas;
* descrições;
* tecnologias;
* dados retornados por IA.

---

## SEC-040 — HTML vindo de fontes externas não deve ser confiável

Quando uma fonte fornecer HTML, o sistema deve preferir:

```text
HTML externo
   ↓
Parsing / Sanitização
   ↓
Dados internos
```

e não renderizar o HTML recebido diretamente.

---

# 15. CSRF

## SEC-041 — Operações que modificam estado devem possuir proteção apropriada

Especialmente:

```text
POST
PUT
PATCH
DELETE
```

As medidas adotadas dependerão do mecanismo final de autenticação do Next.js, mas cookies de sessão não devem ser tratados como proteção suficiente isoladamente em todos os cenários.

---

# 16. Real-time

## SEC-042 — Eventos em tempo real devem ser autorizados

Quando o usuário receber uma nova vaga em tempo real:

```text
nova vaga
   ↓
match criado
   ↓
evento para usuário X
```

o servidor deve garantir que somente o usuário correto receba o evento.

Não confiar em:

```text
userId enviado pelo cliente
```

para decidir o destinatário.

---

# 17. Rate limiting e abuso

## SEC-043 — Endpoints sensíveis devem possuir rate limiting

Prioridade inicial:

```text
login
registro
upload de currículo
operações que chamam LLM
operações de processamento
```

---

## SEC-044 — Limitar consumo de LLM

Como a fase de validação exige custo zero, o consumo de IA deve ser especialmente controlado.

Devem existir limites para:

* tamanho de entrada;
* quantidade de documentos processados;
* número de requisições;
* tamanho da saída;
* frequência por usuário.

---

## SEC-045 — Não permitir que o usuário escolha parâmetros caros do LLM

O cliente não deve controlar livremente:

```text
modelo
max_tokens
prompt do sistema
ferramentas
```

---

# 18. Secrets e configuração

## SEC-046 — Secrets devem ficar em variáveis de ambiente

Exemplos:

```text
DATABASE_URL
AUTH_SECRET
LLM_API_KEY
```

não devem ser versionados no repositório.

---

## SEC-047 — Secrets não devem aparecer em logs

Nunca registrar:

* senhas;
* tokens;
* cookies;
* API keys;
* currículo completo;
* informações privadas desnecessárias.

---

## SEC-048 — Arquivos `.env` reais não devem ser versionados

O repositório deve utilizar somente arquivos de exemplo contendo placeholders.

---

# 19. Logs e erros

## SEC-049 — Mensagens de erro para o cliente devem ser controladas

Não retornar stack traces, queries ou detalhes internos da aplicação em produção.

---

## SEC-050 — Logs devem evitar dados pessoais

O logging deve evitar registrar integralmente:

```text
currículo
descrição completa
email
telefone
tokens
senhas
```

quando isso não for necessário.

---

# 20. Disponibilidade e abuso

## SEC-051 — Operações pesadas não devem bloquear indiscriminadamente a aplicação

Processamentos como:

* parsing de currículo;
* chamadas ao LLM;
* processamento de grandes quantidades de vagas;

devem ser desenhados de maneira que não permitam facilmente consumir todos os recursos da aplicação.

---

## SEC-052 — Processamento diário deve possuir limites

A coleta diária deve possuir proteção contra:

* loops infinitos;
* repetição acidental;
* processamento duplicado;
* fonte externa indisponível;
* volume inesperado de vagas.

---

# 21. Privacidade

## SEC-053 — Coletar apenas os dados necessários

Durante o MVP, armazenar somente os dados necessários para:

* construção do perfil;
* matching;
* funcionamento da aplicação.

Evitar coleta desnecessária.

---

## SEC-054 — Currículos são dados privados

O currículo deve ser tratado como informação privada e acessível somente pelo proprietário e pelos componentes internos autorizados.

---

## SEC-055 — Dados enviados a terceiros devem ser minimizados

Qualquer integração externa, especialmente LLM, deve receber somente o conjunto mínimo de informações necessário.

---

# 22. Dependências

## SEC-056 — Utilizar dependências mantidas

Bibliotecas utilizadas no projeto devem ser preferencialmente:

* amplamente utilizadas;
* mantidas;
* compatíveis com versões suportadas;
* necessárias para o produto.

Evitar dependências desnecessárias.

---

## SEC-057 — Dependências devem ser atualizadas

Correções de segurança relevantes devem ser aplicadas quando identificadas.

---

# 23. Regra de custo zero durante a validação

## SEC-058 — Infraestrutura do MVP deve priorizar custo zero

Enquanto o produto estiver em fase de validação:

> **Nenhum serviço pago deve ser necessário para executar o fluxo principal do produto.**

As decisões devem priorizar:

1. ferramentas open source;
2. serviços self-hosted;
3. free tiers;
4. provedores gratuitos;
5. alternativas locais.

Isso inclui:

* banco de dados;
* hospedagem;
* armazenamento;
* LLM;
* serviços auxiliares;
* observabilidade.

---

## SEC-059 — Não criar arquitetura dependente de serviço pago

Mesmo que determinado serviço possua uma solução paga mais conveniente, o MVP não deve depender dela para funcionar.

Exemplo conceitual:

```text
❌ Produto depende exclusivamente de API paga

✅ Produto utiliza uma abstração
       ↓
LLM Provider
       ↓
Provider gratuito durante validação
```

Isso também facilitará uma eventual troca de fornecedor.

---

## SEC-060 — Limites gratuitos devem ser tratados como parte do design

Como o MVP utilizará serviços gratuitos, o sistema deve considerar:

```text
rate limits
quotas
limites de armazenamento
limites de processamento
indisponibilidade temporária
```

e possuir comportamento adequado quando um limite for atingido.

---

# 24. Prioridade de implementação

Nem todos os requisitos possuem a mesma prioridade.

## 🔴 Obrigatório antes do primeiro teste

```text
SEC-003  Senhas protegidas
SEC-004  Não retornar credenciais
SEC-006  Proteção contra brute force
SEC-007  Sessão segura
SEC-010  Autorização
SEC-011  Proteção contra IDOR
SEC-013  Restrição de arquivos
SEC-014  Validação do arquivo
SEC-015  Limite de tamanho
SEC-017  Currículo privado
SEC-019  Prompt injection — currículo
SEC-020  LLM sem execução de ações
SEC-021  Validação da saída do LLM
SEC-024  Prompt injection — vagas
SEC-027  Não renderizar HTML arbitrário
SEC-029  Matching server-side
SEC-031  Isolamento das recomendações
SEC-032  Fontes externas controladas
SEC-033  Proteção contra SSRF
SEC-036  Queries parametrizadas
SEC-037  Proteção da DATABASE_URL
SEC-038  Isolamento por usuário
SEC-039  Proteção contra XSS
SEC-043  Rate limiting
SEC-046  Secrets em ambiente seguro
SEC-047  Não expor secrets em logs
SEC-053  Minimização de dados
SEC-054  Currículos privados
SEC-058  Custo zero
```

---

## 🟠 Importante durante a implementação

```text
SEC-008  Invalidação de sessão
SEC-009  Expiração
SEC-016  Nome de arquivo
SEC-018  Conteúdo não confiável
SEC-022  Minimização no LLM
SEC-026  Separação de instruções
SEC-030  Integridade do score
SEC-034  Conteúdo externo não confiável
SEC-040  Sanitização
SEC-041  CSRF
SEC-042  Autorização de eventos
SEC-044  Controle de consumo de LLM
SEC-049  Erros controlados
SEC-050  Logs
SEC-051  Operações pesadas
SEC-052  Coleta resiliente
SEC-055  Dados para terceiros
```

---

# 25. Modelo de confiança

O JobCopilot deve partir do seguinte modelo:

```text
                  NÃO CONFIÁVEL
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
    Usuário         Currículo        Vaga externa
       │               │                │
       └───────────────┼────────────────┘
                       ▼
                 VALIDATION LAYER
                       │
                       ▼
                APPLICATION LOGIC
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
          Database              LLM
             ▲                   │
             │                   ▼
             │            VALIDATE OUTPUT
             │                   │
             └───────────┬───────┘
                         ▼
                       USER
```

A regra central é:

> **Dados entram como não confiáveis, passam por validação e somente então podem influenciar o sistema.**

---

# 26. Estratégia de evolução

O Security Baseline do MVP não pretende resolver todos os problemas futuros.

À medida que o produto for validado, poderemos evoluir para:

```text
MVP
 ↓
Hardening
 ↓
Observabilidade
 ↓
Escala
 ↓
Serviços especializados
 ↓
Controles avançados
```

Exemplos de futuras evoluções:

* autenticação multifator;
* gerenciamento avançado de sessões;
* secret manager;
* WAF;
* infraestrutura dedicada;
* isolamento de workers;
* sandboxing de processamento de arquivos;
* antivirus para uploads;
* controles avançados de abuse prevention;
* auditoria;
* modelos de autorização mais sofisticados;
* múltiplos providers de IA;
* mecanismos avançados de proteção contra prompt injection.

---

# 27. Critério de segurança para o MVP

Antes de disponibilizar o MVP para usuários reais, devemos conseguir responder "sim" às seguintes perguntas:

```text
[ ] Um usuário consegue acessar somente seus próprios dados?
[ ] Um usuário consegue acessar somente seus próprios currículos?
[ ] Uploads inválidos são rejeitados?
[ ] Existe limite para tamanho dos arquivos?
[ ] Senhas não são armazenadas em texto puro?
[ ] Secrets não chegam ao browser?
[ ] Login possui proteção contra abuso?
[ ] O LLM não possui acesso direto ao banco?
[ ] O LLM não consegue executar ações?
[ ] A saída da IA é validada?
[ ] Conteúdo de vagas é tratado como não confiável?
[ ] Conteúdo de currículo é tratado como não confiável?
[ ] O matching é calculado no servidor?
[ ] O usuário não consegue fabricar o próprio score?
[ ] Não existe acesso arbitrário a URLs pelo servidor?
[ ] Não existe SQL inseguro desnecessário?
[ ] Conteúdo externo não é renderizado como HTML confiável?
[ ] Eventos em tempo real respeitam autorização?
[ ] Dados pessoais são minimizados?
[ ] O MVP consegue operar utilizando ferramentas gratuitas?
```

---

# 28. Regra final

A prioridade do JobCopilot MVP será:

> **Segurança suficiente para proteger usuários e permitir validação real, sem construir complexidade de infraestrutura antes de existir necessidade de produto.**

O sistema deve ser simples, mas não ingênuo.

A estratégia é:

```text
Simples
   +
Validado
   +
Seguro
   ↓
MVP
   ↓
Feedback real
   ↓
Evolução arquitetural
```

---

**Fim do documento**
