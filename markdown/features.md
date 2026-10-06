# Funcionalidades do sistema de vagas para validação

## Cadastro e perfil do usuário

Será necessária uma forma de identificar o usuário e armazenar as informações extraídas do currículo.

```mermaid
flowchart TD
    A[Usuário] --> B[Upload do currículo]
    B --> C[Extração com IA]
    C --> D[Perfil estruturado]
    D --> E[Usuário revisa as informações]
```

Por exemplo:

- Nome
- Cargo desejado
- Experiência
- Tecnologias
- Habilidades
- Senioridade
- Localização
- Modelo de trabalho desejado

**O usuário deve ser capaz de editar essas informações.**
A IA pode interpretar o currículo incorretamente. Então o usuário deve poder ajustar seu perfil:

```mermaid
flowchart TD
    A[Currículo] --> B[IA extrai informações]
    B --> C[Perfil gerado]
    C --> D[Usuário confirma ou corrige]
```

## Preferências de vagas

O currículo sozinho provavelmente não será suficiente para determinar o que o usuário quer.

Por exemplo, seu currículo pode indicar experiência com:

- **React**
- **Next.js**
- **Angular**

Mas talvez você queira procurar apenas:

- **Frontend**
- **React**
- **Next.js**
- **Remoto**

Então eu adicionaria preferências simples:

- Cargos desejados
- Tecnologias de interesse
- Senioridade desejada
- Modelo de trabalho: remoto, híbrido ou presencial
- Localização, quando aplicável

Não precisa criar um sistema complexo de filtros. Apenas informações suficientes para melhorar o match.

## Lista de vagas recomendadas

Essa é uma feature essencial para a validação.

O usuário precisa conseguir acessar algo como:

```mermaid
flowchart TD
    A[Vagas para você] --> B[🥇 Frontend Developer<br/>Match: 94%]
    A --> C[🥈 React Developer<br/>Match: 91%]
    A --> D[🥉 Frontend Engineer<br/>Match: 86%]
```

Ao entrar em uma vaga:

```mermaid
flowchart TD
    A[Match: 94%] --> B[✓ React]
    A --> C[✓ TypeScript]
    A --> D[✓ Next.js]
    A --> E[✓ Experiência compatível]
    A --> F[⚠ Docker desejável]
    A --> G[⚠ Inglês intermediário]
```

Isso é extremamente importante porque permite ao usuário responder mentalmente:

"*O JobCopilot realmente encontrou vagas que eu teria interesse em aplicar?*"

Essa é a hipótese que estamos tentando validar.

## Feedback sobre o match

```mermaid
flowchart TD
    A[Essa vaga é relevante para você?] --> B[👍 Sim]
    A --> C[👎 Não]
```

Ou:

```mermaid
flowchart TD
    A[Essa vaga é relevante para você?] --> B[✓ Interessante]
    A --> C[✕ Não tenho interesse]
```

Por exemplo:

- Match do algoritmo: 92%
- Feedback do usuário: Não interessado

Poderá começar a descobrir:

- O score está funcionando?
- Quais critérios estão pesando demais?
- Quais informações estão sendo ignoradas?
- O LLM está enriquecendo corretamente?
- Usuários diferentes percebem relevância de formas diferentes?

No futuro, esse feedback poderá alimentar a evolução do algoritmo de matching.

### Produto visualmente definido

```mermaid
flowchart TD
    A[Currículo] --> B[Extração com IA]
    B --> C[Perfil do usuário]
    C --> D[Job Copilot]
    D --> E[Coleta]
    E --> F[Enriquecimento]
    F --> G[Matching]
    G --> H[Vagas recomendadas]
    H --> I[Feedback]
    H --> J[Nova vaga encontrada]
    I --> K[Melhorar o matching]
    J --> L[🔔 Notificação]
```
