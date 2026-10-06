# Arquitetura Técnica — JobCopilot MVP

> **Projeto:** JobCopilot
> **Versão:** 1.0
> **Status:** Definição
> **Objetivo:** Definir a arquitetura técnica mínima necessária para implementação e validação do MVP.

---

# 1. Objetivo

Este documento define a arquitetura técnica inicial do JobCopilot durante sua fase de validação.

O objetivo é construir uma aplicação:

* simples;
* segura;
* de baixo custo operacional;
* fácil de evoluir;
* suficiente para validar a proposta de valor do produto.

A arquitetura não deve antecipar problemas de escala que ainda não existem.

A prioridade será:

```text
Produto funcional
      ↓
Feedback real
      ↓
Validação
      ↓
Evolução arquitetural
```

---

# 2. Premissas

O MVP seguirá as seguintes premissas:

### 2.1 Aplicação full-stack

A primeira versão será construída utilizando **Next.js**, concentrando frontend e backend/server-side na mesma aplicação.

```text
Next.js
├── UI
├── Server Components
├── Server Actions / Route Handlers
├── Application logic
├── Integrações
└── Persistência
```

Não haverá inicialmente um backend NestJS independente.

---

### 2.2 Banco relacional

Será utilizado:

```text
PostgreSQL
```

com:

```text
Prisma ORM
```

---

### 2.3 Custo zero durante a validação

A infraestrutura deverá priorizar:

```text
Open Source
Self-hosted
Free tier
Ferramentas gratuitas
LLMs gratuitos
```

Nenhum serviço pago deve ser necessário para executar o fluxo principal do MVP.

Essa restrição influencia as decisões de infraestrutura e processamento.

---

### 2.4 LLM como componente especializado

O LLM será utilizado principalmente para:

```text
Currículo
    ↓
Extração estruturada

Vaga
    ↓
Enriquecimento estruturado
```

O LLM não será responsável por:

* autorização;
* regras críticas;
* acesso ao banco;
* execução de código;
* tomada de decisões administrativas.

---

# 3. Arquitetura geral

A arquitetura inicial será:

```text
                         ┌─────────────────┐
                         │     Usuário     │
                         └────────┬────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │      Next.js     │
                        │                  │
                        │    Frontend     │
                        │        +         │
                        │ Server-side      │
                        │        +         │
                        │ Application      │
                        └────────┬─────────┘
                                 │
               ┌─────────────────┼─────────────────┐
               │                 │                 │
               ▼                 ▼                 ▼
        ┌────────────┐   ┌──────────────┐   ┌──────────────┐
        │ PostgreSQL │   │  LLM Provider│   │ Job Sources  │
        └────────────┘   └──────────────┘   └──────────────┘
```

O Next.js será a fronteira principal da aplicação.

---

# 4. Separação lógica dentro do Next.js

Apesar de ser uma única aplicação, o código será dividido em responsabilidades.

A aplicação não deve se transformar em um conjunto de Route Handlers contendo toda a lógica do sistema.

A separação lógica será:

```text
Presentation
     ↓
Application
     ↓
Domain
     ↓
Infrastructure
```

Essa separação será **lógica**, e não necessariamente baseada em múltiplas aplicações.

---

# 5. Estrutura inicial do projeto

Estrutura proposta:

```text
jobcopilot/
│
├── src/
│   ├── app/
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── profile/
│   │   ├── resume/
│   │   ├── jobs/
│   │   ├── matching/
│   │   └── recommendations/
│   │
│   ├── application/
│   │   ├── auth/
│   │   ├── resume/
│   │   ├── jobs/
│   │   └── matching/
│   │
│   ├── domain/
│   │   ├── user/
│   │   ├── profile/
│   │   ├── resume/
│   │   ├── job/
│   │   └── matching/
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── ai/
│   │   ├── jobs/
│   │   └── storage/
│   │
│   ├── shared/
│   │   ├── validation/
│   │   ├── errors/
│   │   └── utils/
│   │
│   └── lib/
│
├── prisma/
│
├── public/
│
└── ...
```

A estrutura poderá ser ajustada durante a implementação caso alguma separação se mostre desnecessária.

---

# 6. Responsabilidade das camadas

## 6.1 Presentation

Responsável pela interação com o usuário.

Inclui:

* páginas;
* componentes;
* formulários;
* Route Handlers;
* Server Actions;
* estados da interface.

Essa camada não deve concentrar regras importantes de negócio.

---

## 6.2 Application

Responsável pelos casos de uso.

Exemplos:

```text
CreateUser
ProcessResume
ExtractProfileFromResume
CollectJobs
EnrichJob
CalculateJobMatch
GetRecommendations
RegisterJobFeedback
```

Cada caso de uso coordena as operações necessárias.

---

## 6.3 Domain

Representa regras próprias do negócio.

Exemplos:

```text
Job
UserProfile
JobMatch
MatchScore
JobPreferences
```

O domínio não deve depender de:

* React;
* Next.js;
* Prisma;
* APIs externas;
* componentes de infraestrutura.

---

## 6.4 Infrastructure

Responsável por integrações externas.

Exemplos:

```text
Prisma
LLM provider
Job source
File storage
Scheduler
```

A aplicação deve depender de abstrações quando houver uma integração que possa ser substituída.

---

# 7. Modelo conceitual inicial

O domínio mínimo será composto por:

```text
User
 │
 ├── Resume
 │
 ├── Profile
 │
 ├── Preferences
 │
 └── JobMatch
           │
           ▼
          Job
```

---

# 8. User

Representa a conta do usuário.

Responsabilidades:

* autenticação;
* identificação;
* controle de acesso.

Não deve armazenar todo o perfil profissional diretamente.

---

# 9. Resume

Representa o currículo enviado.

Informações relevantes:

```text
id
userId
file metadata
status
extracted data
createdAt
updatedAt
```

O conteúdo do currículo e o arquivo devem permanecer privados.

---

# 10. Profile

Representa o perfil profissional estruturado.

Exemplos:

```text
skills
experience
education
languages
seniority
roles
```

O perfil pode ter sido criado ou enriquecido a partir do currículo, mas deve ser editável pelo usuário.

---

# 11. Preferences

Representa o que o usuário busca.

Exemplos:

```text
desired roles
desired technologies
seniority
work model
location
```

Essas informações complementam o currículo durante o matching.

---

# 12. Job

Representa uma oportunidade de trabalho normalizada.

Informações previstas:

```text
id
source
externalId
title
company
location
workModel
description
url
publishedAt
collectedAt
```

A vaga deve possuir identificação suficiente para permitir deduplicação.

---

# 13. Job Enrichment

O enriquecimento da vaga poderá ser persistido junto à vaga ou em uma estrutura separada, dependendo da evolução do modelo.

Informações esperadas:

```text
technologies
requirements
niceToHave
seniority
workModel
responsibilities
```

A estrutura deve permitir reprocessamento futuramente.

---

# 14. JobMatch

Representa a relação entre um usuário e uma vaga.

Exemplo:

```text
userId
jobId
score
matchingCriteria
createdAt
```

O score deve ser produzido server-side.

---

# 15. Pipeline de vagas

O pipeline principal será:

```text
Scheduler
    ↓
Collector
    ↓
Raw Job
    ↓
Normalization
    ↓
Deduplication
    ↓
LLM Enrichment
    ↓
Validation
    ↓
Matching
    ↓
Recommendation
```

---

# 16. Scheduler

A coleta ocorrerá inicialmente:

```text
1 vez por dia
```

A implementação deve utilizar o mecanismo mais simples disponível na infraestrutura escolhida.

O MVP não exige inicialmente:

* sistema distribuído;
* múltiplos workers;
* filas complexas;
* processamento paralelo sofisticado.

---

# 17. Collector

O collector será responsável por obter vagas de uma fonte previamente configurada.

Interface conceitual:

```ts
interface JobCollector {
  collect(): Promise<RawJob[]>;
}
```

O restante da aplicação não deve depender diretamente da implementação específica da fonte.

---

# 18. Fonte inicial de vagas

O MVP deve começar com uma quantidade reduzida de fontes.

Objetivo:

```text
1 fonte funcional
     ↓
validar pipeline
     ↓
adicionar outras somente quando necessário
```

Não será construída inicialmente uma plataforma genérica para dezenas de fontes.

---

# 19. Normalização

Diferentes fontes podem representar informações de formas diferentes.

O collector produz:

```text
RawJob
```

e a aplicação converte para:

```text
Job
```

Exemplo:

```text
RawJob
   ↓
Normalizer
   ↓
Job
```

O restante do sistema deve trabalhar preferencialmente com o formato interno normalizado.

---

# 20. Deduplicação

A deduplicação inicial poderá utilizar:

```text
source
+
externalId
```

quando disponível.

Como fallback:

```text
normalized URL
```

ou outra combinação controlada pela aplicação.

O objetivo é evitar que a mesma vaga seja apresentada repetidamente.

---

# 21. Enriquecimento com LLM

O enriquecimento seguirá:

```text
Job description
       ↓
LLM
       ↓
Structured output
       ↓
Schema validation
       ↓
Enriched Job
```

A resposta não será considerada confiável antes da validação.

---

# 22. Abstração do LLM

A aplicação deverá utilizar uma abstração simples:

```ts
interface AiProvider {
  extractProfile(input: string): Promise<ProfileExtraction>;
  enrichJob(input: string): Promise<JobEnrichment>;
}
```

Inicialmente haverá somente uma implementação concreta.

Exemplo conceitual:

```text
AiProvider
     │
     └── FreeLLMProvider
```

Outro provider poderá ser adicionado posteriormente sem alterar os casos de uso.

O provider escolhido para a validação deverá atender à restrição de custo zero.

---

# 23. Extração do currículo

Fluxo:

```text
Upload
  ↓
File validation
  ↓
Text extraction
  ↓
LLM
  ↓
Structured profile
  ↓
Schema validation
  ↓
User review
  ↓
Persisted profile
```

A IA não sobrescreverá silenciosamente informações confirmadas pelo usuário.

---

# 24. Matching

O matching será inicialmente **determinístico**.

A estrutura será:

```text
User Profile
      +
Preferences
      +
Enriched Job
      ↓
Matching Engine
      ↓
Match Score
```

A primeira versão não utilizará LLM para decidir diretamente o score final.

---

# 25. Matching Engine

A interface conceitual será:

```ts
interface MatchingEngine {
  calculate(
    profile: UserProfile,
    preferences: UserPreferences,
    job: EnrichedJob
  ): MatchResult;
}
```

A primeira implementação poderá utilizar pesos configuráveis.

Exemplo:

```text
Skills            40%
Experience        20%
Role              20%
Preferences       20%
```

Os pesos são apenas uma configuração inicial e deverão ser validados empiricamente.

---

# 26. Explicação do match

O matching deve produzir dados suficientes para explicar o resultado.

Exemplo:

```text
score: 89

matches:
- React
- TypeScript
- Next.js
- Remote

gaps:
- AWS
```

O objetivo é evitar um simples:

```text
89%
```

sem contexto.

---

# 27. Recomendações

O usuário terá acesso a uma lista ordenada:

```text
Recommendations
       ↓
Sort by score
       ↓
Display
```

A recomendação deve respeitar o usuário autenticado.

---

# 28. Feedback

O usuário poderá informar:

```text
relevant
not relevant
```

O feedback será persistido.

Fluxo:

```text
Recommendation
      ↓
User feedback
      ↓
Persistence
```

Não haverá inicialmente um sistema automático de machine learning alimentado por esse feedback.

---

# 29. Real-time

O requisito funcional é:

> Assim que uma nova vaga for coletada, processada e considerada relevante para o usuário, a aplicação deve informar o usuário conectado.

Fluxo:

```text
New Job
   ↓
Enrichment
   ↓
Matching
   ↓
Relevant Match
   ↓
Real-time event
   ↓
User interface
```

O conceito de "tempo real" significa **notificar após o processamento**, e não garantir descoberta instantânea da vaga.

Como a coleta ocorre uma vez ao dia:

```text
Publicação da vaga
        ↓
Fonte
        ↓
Próxima coleta diária
        ↓
Processamento
        ↓
Notificação
```

---

# 30. Estratégia inicial de real-time

A implementação deverá utilizar a alternativa mais simples que funcione na infraestrutura escolhida.

A abstração conceitual será:

```ts
interface RealtimeNotifier {
  notifyUser(
    userId: string,
    event: NotificationEvent
  ): Promise<void>;
}
```

Assim, a implementação poderá evoluir posteriormente sem alterar o caso de uso.

O destinatário será determinado pelo servidor através da identidade autenticada.

---

# 31. Autenticação e autorização

A autenticação será baseada em sessão.

Conceitualmente:

```text
Browser
   ↓
Session Cookie
   ↓
Next.js Server
   ↓
Authenticated User
```

Toda operação protegida deverá utilizar a identidade obtida da sessão.

Nunca confiar em um `userId` enviado pelo cliente para determinar propriedade de recursos.

---

# 32. Acesso ao banco

O acesso ao PostgreSQL ocorrerá através do Prisma.

Regra geral:

```text
Application
     ↓
Repository / Data Access
     ↓
Prisma
     ↓
PostgreSQL
```

A lógica específica de persistência não deverá ser espalhada pelos componentes de UI.

---

# 33. Upload e armazenamento

O currículo seguirá:

```text
Browser
   ↓
Upload endpoint
   ↓
Validation
   ↓
Private storage
   ↓
Text extraction
```

O storage inicial poderá ser local ou utilizar uma alternativa gratuita adequada ao MVP.

O mecanismo de armazenamento será abstraído o suficiente para permitir substituição posterior.

---

# 34. Processamento assíncrono

O MVP possui operações naturalmente pesadas:

```text
coleta de vagas
extração de currículo
LLM
matching em lote
```

Inicialmente, a solução deve ser a mais simples possível.

Não será introduzido um sistema distribuído somente por antecipação de escala.

A arquitetura deverá permitir posteriormente a introdução de:

```text
Queue
   ↓
Worker
```

quando a necessidade surgir.

---

# 35. Tratamento de falhas

Falhas de um componente externo não devem corromper o restante da aplicação.

Exemplos:

```text
Fonte indisponível
      ↓
Coleta falha
      ↓
Registrar erro
      ↓
Não destruir dados existentes
```

ou:

```text
LLM indisponível
      ↓
Enrichment falha
      ↓
Vaga permanece armazenada
      ↓
Pode ser reprocessada posteriormente
```

---

# 36. Idempotência

Operações de processamento deverão buscar ser idempotentes.

Exemplos:

```text
mesma vaga coletada duas vezes
        ↓
não criar duas vagas

mesma vaga enriquecida novamente
        ↓
atualizar/reprocessar com segurança

mesmo match processado
        ↓
não criar duplicidade
```

---

# 37. Configuração

Configurações sensíveis ou dependentes do ambiente deverão utilizar variáveis de ambiente.

Exemplos:

```text
DATABASE_URL
AUTH_SECRET
AI_API_KEY
STORAGE_CONFIGURATION
```

Não utilizar prefixos públicos para secrets.

---

# 38. Validação

O MVP utilizará validação de entrada e saída.

Entrada:

```text
Request
  ↓
Zod
  ↓
Application
```

LLM:

```text
LLM Response
  ↓
Zod
  ↓
Application
```

A validação será uma fronteira importante entre dados externos e regras internas.

---

# 39. Segurança

A arquitetura deve respeitar integralmente o documento:

> **Security Baseline — JobCopilot MVP**

Entre os requisitos fundamentais estão:

```text
Authentication
Authorization
IDOR protection
Secure sessions
Rate limiting
Secure uploads
XSS protection
CSRF protection
SSRF protection
LLM output validation
Prompt injection mitigation
Secret protection
Data minimization
```

A segurança não será adicionada apenas posteriormente como uma etapa separada.

---

# 40. Observabilidade

Durante o MVP, a observabilidade será simples.

Precisamos conseguir identificar:

```text
coleta iniciou
coleta terminou
quantas vagas foram encontradas
quantas foram novas
quantas foram enriquecidas
quantos matches foram criados
falhas de processamento
```

Os logs não devem conter dados pessoais desnecessários.

---

# 41. Escopo tecnológico inicial

O stack definido será:

```text
Frontend
└── Next.js + TypeScript

Backend
└── Next.js Server-side

Database
└── PostgreSQL

ORM
└── Prisma

Validation
└── Zod

AI
└── Free / zero-cost LLM provider

Storage
└── Free / local / self-hosted

Scheduling
└── Free / built-in / infrastructure-provided mechanism

Real-time
└── Simplest viable zero-cost solution
```

---

# 42. O que deliberadamente não será implementado

A seguinte infraestrutura pertence à evolução futura e não ao MVP inicial:

```text
NestJS dedicado
Microservices
CQRS completo
Event Bus sofisticado
Outbox Pattern
Kafka
Redis obrigatório
BullMQ obrigatório
Workers distribuídos
Kubernetes
Elasticsearch
Vector Database
Multiple AI Providers
Machine Learning personalizado
Complex recommendation system
```

A ausência dessas tecnologias não representa uma falha arquitetural.

Representa uma decisão consciente de manter o MVP simples.

---

# 43. Arquitetura futura

Caso a validação seja bem-sucedida, a evolução poderá seguir:

```text
             ┌───────────────┐
             │    Next.js    │
             │   Frontend    │
             └───────┬───────┘
                     │
                    HTTP
                     │
             ┌───────▼───────┐
             │    NestJS     │
             │      API      │
             └───────┬───────┘
                     │
      ┌──────────────┼───────────────┐
      ▼              ▼               ▼
 PostgreSQL        Queue           Cache
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   Collector      AI Worker   Match Worker
```

Essa arquitetura será construída **somente quando métricas reais demonstrarem necessidade**.

---

# 44. Princípio de evolução

A arquitetura do MVP seguirá:

> **Simple now, evolvable later.**

Isso significa:

```text
MVP
 ↓
Interfaces onde há volatilidade
 ↓
Implementações simples
 ↓
Feedback
 ↓
Identificação de gargalos reais
 ↓
Refatoração
```

Não serão criadas abstrações apenas para satisfazer princípios teóricos.

---

# 45. Critérios para evoluir a arquitetura

Uma mudança arquitetural relevante deverá possuir uma justificativa concreta.

Exemplos:

### Redis

Adicionar caso:

```text
necessidade real de cache
ou
coordenação de processamento
```

### Queue / Worker

Adicionar caso:

```text
processamentos longos
ou
volume de jobs significativo
```

### Backend separado

Adicionar caso:

```text
frontend e backend possuam ciclos de evolução
ou
necessidade de múltiplos clientes
ou
limitações do Next.js
```

### Serviços separados

Adicionar somente quando:

```text
workload
escala
isolamento
ou
necessidade operacional
```

justificarem a separação.

---

# 46. Ordem de implementação

A implementação seguirá aproximadamente:

```text
1. Bootstrap do Next.js
        ↓
2. Banco + Prisma
        ↓
3. Autenticação
        ↓
4. User / Profile / Preferences
        ↓
5. Upload e processamento de currículo
        ↓
6. Collector
        ↓
7. Job + normalização + deduplicação
        ↓
8. LLM enrichment
        ↓
9. Matching engine
        ↓
10. Recommendations
        ↓
11. Feedback
        ↓
12. Scheduler diário
        ↓
13. Real-time
        ↓
14. Security hardening
        ↓
15. Testes de aceitação
```

A ordem poderá ser ajustada quando uma etapa revelar uma dependência necessária.

---

# 47. Fluxo completo esperado

Ao final do MVP:

```text
                    ┌──────────────┐
                    │    Usuário   │
                    └──────┬───────┘
                           │
                      Currículo
                           │
                           ▼
                 ┌──────────────────┐
                 │ Profile Builder  │
                 │      + LLM       │
                 └────────┬─────────┘
                          │
                   Perfil confirmado
                          │
                          ▼
                   ┌────────────┐
                   │ Preferences│
                   └─────┬──────┘
                         │
                         │
                         │
                         ▼
              ┌─────────────────────┐
              │  Daily Job Collector│
              └──────────┬──────────┘
                         │
                         ▼
                       Jobs
                         │
                         ▼
                    Normalize
                         │
                         ▼
                    Deduplicate
                         │
                         ▼
                  LLM Enrichment
                         │
                         ▼
                     Matching
                         │
                         ▼
                  Recommendations
                         │
               ┌─────────┴─────────┐
               ▼                   ▼
           Dashboard        Real-time event
               │                   │
               └─────────┬─────────┘
                         ▼
                       User
                         │
                         ▼
                      Feedback
```

---

# 48. Resultado esperado da arquitetura

A arquitetura deve permitir que o JobCopilot valide três hipóteses fundamentais:

### Hipótese 1

Usuários consideram útil ter seu currículo transformado automaticamente em um perfil estruturado.

### Hipótese 2

Usuários consideram úteis vagas enriquecidas e organizadas automaticamente.

### Hipótese 3

Usuários consideram relevante receber recomendações baseadas em compatibilidade com seu perfil.

A arquitetura deve existir para testar essas hipóteses — e não para provar que somos capazes de construir uma infraestrutura complexa.

---

# 49. Decisão arquitetural

Para o MVP:

> **O JobCopilot será implementado como uma aplicação full-stack em Next.js, utilizando PostgreSQL + Prisma, um provider de LLM gratuito, processamento de vagas diário e um mecanismo simples de atualização em tempo real.**

A aplicação manterá separação lógica entre apresentação, aplicação, domínio e infraestrutura, mas evitará complexidade arquitetural que não seja necessária para a validação do produto.

A futura evolução para frontend independente + backend NestJS + workers + filas + serviços especializados permanece como possibilidade, não como requisito atual.

---

# 50. Status

```text
Escopo funcional          ✅ Definido
Security Baseline         ✅ Definido
Arquitetura MVP           ✅ Definida
Modelo conceitual         ✅ Definido
Pipeline                  ✅ Definido
Estratégia de matching    ✅ Definida
Real-time                 ✅ Definido conceitualmente
Stack                     ✅ Definido
Custo zero                ✅ Requisito
```

## Próxima etapa

A próxima atividade é transformar esta arquitetura em:

1. **modelo de dados/ERD do MVP;**
2. **schema inicial do Prisma;**
3. **estrutura concreta de diretórios;**
4. **contratos Zod dos principais fluxos.**

Depois disso, iniciamos a implementação.
