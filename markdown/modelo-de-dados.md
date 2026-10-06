# Modelo de Domínio e Dados — JobCopilot MVP

> **Projeto:** JobCopilot
> **Versão:** 1.0
> **Status:** Proposta para implementação
> **Objetivo:** Definir o modelo mínimo de domínio e persistência necessário para o MVP.

---

# 1. Objetivo

O modelo deve suportar o fluxo:

```text
Usuário
   ↓
Currículo
   ↓
Perfil profissional
   +
Preferências
   ↓
Vagas coletadas
   ↓
Enriquecimento
   ↓
Matching
   ↓
Recomendações
   ↓
Feedback
```

O objetivo é armazenar somente informações necessárias para esse fluxo.

---

# 2. Entidades do MVP

O domínio inicial será composto por:

```text
User
Resume
Profile
Preference
JobSource
Job
JobEnrichment
JobMatch
MatchFeedback
```

Relacionamento geral:

```text
                     User
                      │
            ┌─────────┼─────────┐
            │         │         │
            ▼         ▼         ▼
         Resume    Profile  Preference
                      │
                      │
                      │
JobSource ─────────── Job
                    │
                    ▼
              JobEnrichment
                    │
                    ▼
                 JobMatch
                    │
                    ▼
              MatchFeedback
```

---

# 3. User

Representa a conta autenticada.

## Responsabilidade

* Identidade da conta
* Autenticação
* Associação dos dados privados ao usuário

## Atributos

```text
id
email
passwordHash
createdAt
updatedAt
```

### Regras

* `email` deve ser único.
* `passwordHash` nunca deve ser exposto.
* O usuário é proprietário de seus dados privados.

---

# 4. Resume

Representa um currículo enviado pelo usuário.

## Responsabilidade

* Metadados do currículo
* Controle do processamento
* Associação entre documento e usuário

## Atributos

```text
id
userId

fileName
storageKey
mimeType
fileSize

status

createdAt
updatedAt
```

### Status

Inicialmente:

```text
PENDING
PROCESSING
PROCESSED
FAILED
```

### Observação

O arquivo físico não deve ser armazenado diretamente como um blob no banco.

O banco armazena os metadados e a referência para o storage.

---

# 5. Resume Extraction

A informação extraída do currículo pode ser armazenada como parte do processamento do currículo, mas não deve ser confundida com o perfil final confirmado pelo usuário.

Conceitualmente:

```text
Resume
   ↓
Extraction
   ↓
Profile draft
   ↓
User confirmation
   ↓
Profile
```

Para o MVP, a extração pode ser armazenada em formato estruturado/JSON associado ao currículo.

Exemplo:

```json
{
  "skills": ["React", "TypeScript", "Next.js"],
  "experience": [],
  "education": [],
  "languages": []
}
```

Esse dado representa **o resultado da IA**, não necessariamente a informação oficial do usuário.

---

# 6. Profile

Representa o perfil profissional utilizado pelo matching.

## Responsabilidade

* Informações profissionais confirmadas pelo usuário
* Base principal para matching

## Informações conceituais

```text
headline
summary
skills
experiences
education
languages
seniority
roles
```

No MVP, estruturas que possuem natureza variável podem ser armazenadas como JSON estruturado, desde que validadas pela aplicação.

---

# 7. Preference

Representa o que o usuário deseja encontrar.

## Responsabilidade

Complementar o currículo com as preferências atuais do usuário.

## Informações

```text
desiredRoles
desiredSkills
seniority
workModels
locations
```

Exemplo:

```json
{
  "desiredRoles": [
    "Frontend Developer",
    "Frontend Engineer"
  ],
  "desiredSkills": [
    "React",
    "TypeScript"
  ],
  "seniority": "MID",
  "workModels": [
    "REMOTE"
  ]
}
```

As preferências são independentes do currículo.

Isso é importante porque:

```text
currículo = "o que eu sou / já fiz"

preferências = "o que eu estou procurando agora"
```

---

# 8. JobSource

Representa a origem de uma vaga.

## Responsabilidade

Identificar de onde a oportunidade foi coletada.

## Atributos

```text
id
name
baseUrl
type
createdAt
```

Exemplo:

```text
LinkedIn
Greenhouse
Fonte X
```

O usuário não deve poder registrar arbitrariamente URLs como fontes.

---

# 9. Job

Representa a oportunidade normalizada internamente.

## Responsabilidade

Armazenar os dados principais da vaga independentemente do formato utilizado pela fonte.

## Atributos

```text
id
sourceId

externalId
url

title
company
description

location
workModel

publishedAt
collectedAt

createdAt
updatedAt
```

### Identidade

Preferência de identificação:

```text
sourceId + externalId
```

Quando `externalId` não existir:

```text
sourceId + normalizedUrl
```

Essa combinação será utilizada para deduplicação.

---

# 10. JobEnrichment

Representa os dados estruturados obtidos pelo processamento da vaga.

## Responsabilidade

Transformar uma descrição textual em informação útil para matching.

## Informações

```text
technologies
requirements
niceToHave
responsibilities
seniority
workModel
```

Exemplo:

```json
{
  "technologies": [
    "React",
    "TypeScript",
    "Next.js"
  ],
  "requirements": [
    "3 anos de experiência com React"
  ],
  "niceToHave": [
    "AWS"
  ],
  "seniority": "MID",
  "workModel": "REMOTE"
}
```

### Característica importante

O enriquecimento é **derivado** da vaga original.

Ele pode ser reprocessado futuramente.

Portanto, o modelo deve permitir:

```text
Job
 ↓
Enrichment V1
 ↓
Enrichment V2
```

mesmo que o MVP armazene somente a versão atualmente ativa.

---

# 11. JobMatch

Representa a compatibilidade entre um usuário e uma vaga.

## Responsabilidade

Persistir a recomendação produzida pelo matching.

## Atributos

```text
id
userId
jobId

score
matchedCriteria
missingCriteria

createdAt
updatedAt
```

Exemplo:

```json
{
  "score": 91,
  "matchedCriteria": [
    "React",
    "TypeScript",
    "Next.js",
    "REMOTE"
  ],
  "missingCriteria": [
    "AWS"
  ]
}
```

O `score` pertence ao sistema.

O cliente não pode defini-lo.

---

# 12. MatchFeedback

Representa a resposta do usuário à recomendação.

## Responsabilidade

Registrar se a recomendação foi percebida como relevante.

## Atributos

```text
id
userId
jobMatchId
type
createdAt
```

### Valores iniciais

```text
RELEVANT
NOT_RELEVANT
```

O feedback pertence ao usuário e ao match correspondente.

---

# 13. Session

Embora não faça parte do fluxo de domínio principal, uma entidade de sessão será necessária para autenticação baseada em sessão.

## Atributos conceituais

```text
id
userId
expiresAt
createdAt
```

O token/identificador de sessão deve possuir armazenamento seguro e nunca ser exposto desnecessariamente.

---

# 14. Relacionamentos

## User → Resume

```text
User 1 ─── N Resume
```

Um usuário pode possuir múltiplos currículos.

Entretanto, o MVP pode considerar apenas um currículo ativo.

---

## User → Profile

```text
User 1 ─── 1 Profile
```

O usuário possui um perfil profissional principal.

---

## User → Preference

```text
User 1 ─── 1 Preference
```

Existe um conjunto atual de preferências.

---

## JobSource → Job

```text
JobSource 1 ─── N Job
```

Uma fonte possui diversas vagas.

---

## Job → JobEnrichment

```text
Job 1 ─── 1 JobEnrichment
```

Para o MVP, uma vaga possui um enriquecimento ativo.

A arquitetura deve permitir versionamento futuro.

---

## User ↔ Job

A relação entre usuário e vaga é:

```text
User N ─── N Job
```

através de:

```text
JobMatch
```

---

## JobMatch → MatchFeedback

```text
JobMatch 1 ─── 0..1 MatchFeedback
```

Para o MVP, consideraremos o feedback atual do usuário para aquele match.

---

# 15. Identidade e unicidade

Devemos garantir algumas restrições no banco.

## User

```text
email UNIQUE
```

## Job

Preferencialmente:

```text
(sourceId, externalId) UNIQUE
```

quando aplicável.

Caso a fonte não possua `externalId`, a aplicação deverá possuir uma estratégia alternativa baseada na URL normalizada.

## JobMatch

```text
(userId, jobId) UNIQUE
```

Isso evita múltiplos matches simultâneos para a mesma combinação.

---

# 16. Dados derivados

Alguns dados não devem ser tratados como fonte primária da verdade.

### Perfil

```text
Resume
   ↓
AI Extraction
   ↓
Profile
```

O perfil confirmado pelo usuário é a informação utilizada pelo matching.

### Enrichment

```text
Job
   ↓
LLM
   ↓
JobEnrichment
```

A vaga original continua sendo a fonte primária.

### Match

```text
Profile
+
Preference
+
JobEnrichment
   ↓
JobMatch
```

O match é um resultado derivado.

---

# 17. O que não armazenaremos inicialmente

Para manter o MVP enxuto, não teremos entidades específicas para:

```text
Company
Skill
Technology
Location
Application
Notification
Subscription
Plan
Payment
Interview
ResumeVersion
MatchAlgorithmVersion
```

Quando necessário, essas estruturas poderão surgir em versões futuras.

---

# 18. Tecnologias e habilidades

No MVP, tecnologias e habilidades poderão ser armazenadas em estruturas simples:

```json
[
  "React",
  "TypeScript",
  "Next.js"
]
```

Não teremos inicialmente uma entidade:

```text
Technology
```

porque isso adicionaria complexidade sem necessariamente contribuir para a validação.

Posteriormente, caso exista necessidade de:

* taxonomia;
* aliases;
* normalização avançada;
* relacionamentos;
* analytics;

poderemos introduzir uma entidade própria.

---

# 19. Status de processamento

O sistema precisará acompanhar operações assíncronas ou potencialmente demoradas.

Inicialmente:

### Resume

```text
PENDING
PROCESSING
PROCESSED
FAILED
```

### Job Enrichment

```text
PENDING
PROCESSING
PROCESSED
FAILED
```

A aplicação poderá futuramente adotar estados mais sofisticados caso o processamento cresça.

---

# 20. Retenção de dados

Para o MVP:

* currículos permanecem associados ao usuário;
* vagas permanecem armazenadas enquanto forem relevantes para o produto;
* matches permanecem armazenados para feedback e análise;
* dados temporários de processamento podem ser removidos após conclusão quando não forem mais necessários.

A política definitiva de retenção será definida conforme o mecanismo de storage e as necessidades do produto.

---

# 21. Fluxo de dados — currículo

```text
                ┌────────────┐
                │    User    │
                └─────┬──────┘
                      │
                      ▼
                  Upload
                      │
                      ▼
                   Resume
                      │
                      ▼
             Text Extraction
                      │
                      ▼
                    LLM
                      │
                      ▼
              Resume Extraction
                      │
                      ▼
               User Review
                      │
                      ▼
                   Profile
```

---

# 22. Fluxo de dados — vaga

```text
JobSource
    │
    ▼
Collector
    │
    ▼
Raw Job
    │
    ▼
Normalization
    │
    ▼
Job
    │
    ▼
LLM
    │
    ▼
JobEnrichment
```

---

# 23. Fluxo de matching

```text
Profile
   +
Preference
   +
JobEnrichment
   │
   ▼
MatchingEngine
   │
   ▼
JobMatch
   │
   ▼
Recommendation
   │
   ▼
User Feedback
```

---

# 24. Real-time

O evento de nova recomendação não precisa ser uma entidade própria no banco durante o MVP.

O estado persistente é:

```text
JobMatch
```

O evento é transitório:

```text
JobMatch criado
      ↓
RealtimeNotifier
      ↓
Usuário conectado
```

Uma entidade `Notification` poderá ser criada posteriormente caso seja necessário manter histórico, notificações não lidas, e-mail ou push notifications.

---

# 25. Segurança dos relacionamentos

As entidades privadas:

```text
Resume
Profile
Preference
JobMatch
MatchFeedback
Session
```

devem sempre estar associadas ao `userId` ou ser alcançáveis através de uma relação cujo proprietário seja determinado pelo `userId` autenticado.

Nenhuma autorização deve depender exclusivamente do identificador enviado pelo cliente.

---

# 26. Princípio de persistência

O banco deve armazenar:

> **Estado necessário para o produto e resultados importantes do processamento.**

Não deve armazenar:

> **Tudo que passa pelo sistema.**

Isso evita transformar o MVP em um repositório de dados desnecessários.

---

# 27. Modelo conceitual final

```text
                         ┌──────────────┐
                         │     User     │
                         └──────┬───────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                  │
              ▼                 ▼                  ▼
           Resume            Profile          Preference
              │
              ▼
      Resume Extraction


┌──────────────┐
│  JobSource   │
└──────┬───────┘
       │
       ▼
      Job
       │
       ▼
 JobEnrichment
       │
       │
       └────────────────┐
                        │
                        ▼
                  ┌───────────┐
                  │ JobMatch  │
                  └─────┬─────┘
                        │
                        ▼
                 MatchFeedback
```

---

# 28. Decisões para o schema Prisma

O schema deverá refletir somente o modelo aprovado neste documento.

Inicialmente teremos:

```text
User
Session
Resume
Profile
Preference
JobSource
Job
JobEnrichment
JobMatch
MatchFeedback
```

Alguns atributos complexos poderão utilizar `Json`, desde que:

* o formato seja definido;
* seja validado pela aplicação;
* não sejam usados como substituição indiscriminada de relações do domínio.

---

# 29. Próxima etapa

A partir deste modelo, o próximo artefato será:

> **Prisma Schema — JobCopilot MVP**

Nele vamos transformar as entidades e relacionamentos acima em tabelas concretas, definindo:

* tipos;
* enums;
* `@id`;
* `@unique`;
* índices;
* foreign keys;
* `onDelete`;
* timestamps;
* campos `Json`;
* estratégia de armazenamento.

Somente depois do schema aprovado passaremos para a implementação do projeto.
