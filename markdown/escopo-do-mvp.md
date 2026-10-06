Perfeito. Vamos seguir exatamente nessa ordem:

1. **Definir oficialmente o escopo do MVP**
2. **Planejar os fluxos e a arquitetura mínima**
3. **Identificar as superfícies de ataque**
4. **Definir as medidas de segurança**
5. **Iniciar a implementação**

Acho uma excelente decisão analisar segurança **antes da implementação**, especialmente porque o JobCopilot lidará com dados pessoais, currículos, autenticação e integrações com APIs de IA.

---

# Documento de Escopo — JobCopilot MVP

## 1. Visão do produto

O **JobCopilot** será uma aplicação que automatiza parte do processo de busca e descoberta de oportunidades de trabalho.

A proposta central do MVP será:

> **Permitir que o usuário envie seu currículo, tenha seu perfil estruturado automaticamente e receba vagas relevantes de acordo com seu perfil e preferências.**

O principal objetivo desta primeira versão não é construir uma plataforma completa de empregabilidade.

É validar a seguinte hipótese:

> **Usuários percebem valor em receber automaticamente vagas selecionadas e classificadas de acordo com seu perfil profissional.**

---

# 2. Funcionalidades do MVP

## 2.1 Autenticação e gerenciamento de usuário

O usuário deverá ser capaz de:

* Criar uma conta
* Realizar login
* Encerrar sua sessão
* Acessar apenas os próprios dados

Inicialmente, não precisamos implementar:

* Login social
* Múltiplos métodos de autenticação
* Recuperação de senha complexa
* Autenticação multifator

Essas funcionalidades poderão ser adicionadas posteriormente.

---

# 3. Currículo e construção do perfil

O usuário deverá poder enviar seu currículo.

O sistema executará o seguinte fluxo:

```text
Upload do currículo
        ↓
Extração do conteúdo
        ↓
Processamento
        ↓
Extração das informações relevantes
        ↓
Criação do perfil estruturado
```

As informações extraídas poderão incluir:

```text
Experiências profissionais
Tecnologias
Habilidades
Formação
Projetos
Idiomas
Áreas de atuação
Senioridade estimada
```

### Regra importante

A informação extraída pela IA **não será considerada automaticamente como verdade absoluta**.

O usuário deverá revisar e editar as informações.

```text
Currículo
   ↓
IA extrai
   ↓
Perfil gerado
   ↓
Usuário revisa
   ↓
Perfil confirmado
```

Essa etapa é essencial para melhorar a qualidade do matching.

---

# 4. Preferências profissionais

Além do currículo, o usuário poderá informar o que procura.

Inicialmente:

* Cargos ou áreas desejadas
* Tecnologias de interesse
* Senioridade desejada
* Modelo de trabalho

  * Remoto
  * Híbrido
  * Presencial

Essas informações serão utilizadas junto com o perfil para calcular a compatibilidade com uma vaga.

---

# 5. Coleta automática de vagas

O JobCopilot deverá buscar vagas automaticamente.

Para o MVP:

```text
Execução: 1 vez por dia
Fontes: inicialmente poucas fontes
```

O fluxo será:

```text
Scheduler
    ↓
Fonte de vagas
    ↓
Coleta
    ↓
Armazenamento
    ↓
Normalização
```

Inicialmente, o objetivo é validar o pipeline com **uma fonte de vagas**.

Posteriormente:

```text
Fonte A
Fonte B
Fonte C
Fonte D
```

---

# 6. Normalização e deduplicação

As vagas coletadas poderão possuir formatos diferentes.

Por isso:

```text
Vaga original
     ↓
Normalização
     ↓
Formato interno
```

Também devemos impedir que a mesma vaga seja exibida diversas vezes.

Inicialmente, a deduplicação pode ser simples, utilizando informações como:

* URL da vaga
* Fonte
* Identificador externo, quando disponível

Posteriormente, podemos utilizar técnicas mais sofisticadas.

---

# 7. Enriquecimento de vagas com LLM

Após a coleta, a descrição da vaga será analisada.

O objetivo será transformar conteúdo pouco estruturado em informações úteis.

Exemplo:

```text
Descrição original
        ↓
       LLM
        ↓
Vaga estruturada
```

As informações enriquecidas poderão incluir:

* Tecnologias
* Habilidades necessárias
* Senioridade
* Requisitos obrigatórios
* Diferenciais
* Modelo de trabalho
* Área profissional

A saída deverá seguir uma estrutura previsível para evitar que informações livres do LLM contaminem o restante do sistema.

---

# 8. Matching de vagas

O sistema comparará:

```text
Perfil profissional
        +
Preferências
        +
Vaga enriquecida
        ↓
Matching
        ↓
Score de compatibilidade
```

O resultado deverá fornecer:

* Score de compatibilidade
* Pontos de compatibilidade
* Pontos ausentes ou divergentes
* Motivos da recomendação

Exemplo:

```text
Match: 89%

Compatibilidades:
✓ React
✓ TypeScript
✓ Next.js
✓ Trabalho remoto

Pontos ausentes:
⚠ AWS desejável
⚠ Inglês avançado
```

### Importante

O primeiro algoritmo de matching deverá ser **determinístico e compreensível**.

Não começaremos utilizando uma IA para decidir completamente se uma vaga é adequada ou não.

A IA será usada inicialmente para **estruturar informações**.

O score será calculado por regras controladas pela aplicação.

Isso facilitará:

* Debug
* Evolução
* Explicabilidade
* Validação do algoritmo

---

# 9. Recomendações de vagas

O usuário deverá visualizar suas vagas recomendadas.

A aplicação apresentará:

```text
Vaga
Empresa
Localização
Modelo de trabalho
Score de compatibilidade
Principais motivos do match
```

O usuário poderá acessar os detalhes e, quando desejar se candidatar, será direcionado para a **fonte original da vaga**.

O JobCopilot não realizará candidatura automática no MVP.

---

# 10. Feedback do usuário

O usuário poderá avaliar uma recomendação.

Inicialmente:

```text
👍 Relevante

👎 Não relevante
```

Esse feedback permitirá comparar:

```text
Score calculado
        ×
Percepção do usuário
```

Esses dados serão importantes para responder perguntas como:

* Um score alto realmente representa uma vaga relevante?
* Quais critérios precisam ser melhorados?
* O algoritmo está valorizando os fatores corretos?

---

# 11. Atualizações de novas vagas

Quando uma nova vaga for coletada:

```text
Nova vaga
    ↓
Normalização
    ↓
Enriquecimento
    ↓
Matching
```

Caso ela seja relevante para determinado usuário:

```text
Score ≥ limite mínimo
        ↓
Nova recomendação
        ↓
Atualização em tempo real
```

Para o MVP, a atualização poderá ocorrer **dentro da própria aplicação**.

O comportamento seria:

```text
Usuário conectado
      ↓
Nova vaga compatível processada
      ↓
Interface atualizada
      ↓
🔔 Nova vaga recomendada
```

Não precisamos começar com:

* Push notification
* E-mail
* SMS
* WhatsApp

Esses canais podem ser adicionados posteriormente.

---

# 12. Fluxo principal do sistema

O MVP terá essencialmente dois grandes fluxos.

## Fluxo A — Construção do perfil

```text
Cadastro
   ↓
Upload do currículo
   ↓
Extração de informações
   ↓
Perfil estruturado
   ↓
Revisão do usuário
   ↓
Preferências
```

## Fluxo B — Processamento das vagas

```text
Coleta diária
   ↓
Novas vagas
   ↓
Normalização
   ↓
Deduplicação
   ↓
Enriquecimento com LLM
   ↓
Matching
   ↓
Recomendações
   ↓
Feedback do usuário
```

---

# 13. Fora do escopo do MVP

Explicitamente **não implementaremos agora**:

* Aplicação automática para vagas
* Geração de currículo
* Otimização automática de currículo
* Simulador de entrevistas
* Chatbot profissional
* Login social
* Autenticação multifator
* Aplicativo mobile
* Extensão de navegador
* Múltiplos provedores de IA
* Dezenas de fontes de vagas
* Microserviços
* Backend NestJS dedicado
* Sistema avançado de notificações
* Algoritmo de machine learning personalizado
* Matching baseado exclusivamente em LLM

---

# 14. Stack inicial proposta

Para manter o MVP enxuto:

```text
Next.js
├── Frontend
├── Server Components
├── Server Actions / Route Handlers
└── Regras da aplicação

PostgreSQL
└── Persistência

Prisma
└── ORM

LLM Provider
└── Extração e enriquecimento

Scheduler
└── Coleta diária
```

Para atualizações em tempo real, vamos avaliar a solução mais simples depois de entendermos exatamente onde e como o processamento ocorrerá.

---

# 15. Critério de sucesso do MVP

Eu definiria o sucesso inicialmente com base nesta pergunta:

> **As vagas recomendadas pelo JobCopilot são percebidas pelos usuários como relevantes?**

Podemos medir isso utilizando:

```text
Número de vagas recomendadas
        +
Feedback positivo
        +
Feedback negativo
        +
Interação com a vaga
```

Exemplo:

```text
100 recomendações

70 relevantes
20 neutras
10 irrelevantes
```

Isso nos dá dados reais para decidir se o produto merece evoluir.

---

## Próxima etapa: segurança

Antes de implementar, eu sugiro fazermos uma **análise de ameaças específica para esse MVP**.

Não apenas uma lista genérica de "SQL Injection, XSS e CSRF", mas analisando cada ponto real da aplicação:

```text
Usuário
   ↓
Autenticação
   ↓
Upload de currículo ────────────────┐
   ↓                                │
Banco de dados                      │
   ↓                                │
LLM API                             │
   ↑                                │
Coleta externa de vagas ────────────┘
   ↓
Matching
   ↓
Atualização em tempo real
```

A partir daí, podemos identificar **vetores de ataque, impacto, probabilidade e medidas concretas de mitigação**, criando um modelo de ameaças que realmente oriente a implementação do JobCopilot.
