# Long Beach OS — Arquitetura Standalone v0.2

**Data:** 01/10/2026  
**Status:** decisão arquitetural consolidada  
**Substitui:** `LongBeach_OS_Plano_Funcional_Tecnico_v0.1.md`

## 1. Decisão

O Long Beach OS será um produto independente.

Não reutilizará código, banco de dados, autenticação, API, frontend, entidades ou infraestrutura lógica da Plataforma QuebraNunca Futevôlei.

A relação inicial entre os produtos será apenas de domínio e infraestrutura de publicação:

- Web: `longbeach.quebranunca.com.br`
- API sugerida: `api.longbeach.quebranunca.com.br`

O sistema deverá permanecer tecnicamente desacoplado para permitir, no futuro:

- mudança para domínio próprio;
- integração por API com QuebraNunca;
- autenticação federada;
- compartilhamento controlado de dados;
- migração independente;
- venda ou operação independente do produto.

Não haverá banco compartilhado, foreign keys entre sistemas nem chamadas obrigatórias para a API da QuebraNunca.

---

## 2. Objetivos técnicos

1. Criar uma base própria e simples para a Long Beach.
2. Preservar a mesma linha tecnológica já conhecida pela equipe.
3. Desenvolver web e mobile a partir da mesma base de frontend.
4. Preparar desde o início publicação na App Store e Google Play.
5. Evitar microserviços, múltiplos produtos e abstrações prematuras.
6. Permitir evolução modular: Escola, Agenda, Grupos, Infraestrutura, Financeiro e Dashboard.
7. Deixar integrações futuras com QuebraNunca isoladas por contratos e adapters.

---

## 3. Stack recomendada

### Backend

- .NET 10 LTS;
- ASP.NET Core Web API;
- Entity Framework Core;
- PostgreSQL;
- JWT com access token e refresh token;
- FluentValidation ou validações explícitas na aplicação;
- Serilog;
- health checks;
- OpenAPI;
- xUnit;
- testes de integração;
- migrations do EF Core como fonte oficial do schema.

### Frontend web e mobile

- React;
- TypeScript;
- Vite;
- React Router;
- TanStack Query;
- biblioteca de formulários e validação;
- design system próprio da Long Beach;
- PWA;
- Capacitor para iOS e Android;
- push notifications;
- câmera e upload de evidências;
- monitoramento de conectividade;
- armazenamento seguro de credenciais no aplicativo;
- deep links;
- suporte progressivo a operação offline.

### Infraestrutura

- repositório próprio;
- banco PostgreSQL próprio;
- deploy próprio;
- secrets próprios;
- logs próprios;
- backups próprios;
- domínios e certificados próprios;
- contas de publicação mobile sob governança da Long Beach.

---

## 4. Organização do repositório

Recomendação: um monorepo pequeno, contendo backend, frontend e wrappers mobile.

```text
longbeach-os/
├── LongBeach.sln
├── src/
│   ├── LongBeach.Api/
│   ├── LongBeach.Application/
│   ├── LongBeach.Domain/
│   ├── LongBeach.Infrastructure/
│   └── LongBeach.Contracts/
├── tests/
│   ├── LongBeach.UnitTests/
│   └── LongBeach.IntegrationTests/
├── app/
│   ├── src/
│   ├── public/
│   ├── android/
│   ├── ios/
│   ├── capacitor.config.ts
│   ├── vite.config.ts
│   └── package.json
├── docs/
│   ├── adr/
│   ├── arquitetura/
│   ├── produto/
│   └── operacao/
├── scripts/
├── docker-compose.yml
├── README.md
└── AGENTS.md
```

O monorepo simplifica:

- versionamento;
- contratos entre API e frontend;
- execução local;
- CI/CD;
- documentação;
- releases coordenadas.

Os deploys continuam independentes:

- API;
- frontend web;
- banco;
- aplicativo iOS;
- aplicativo Android.

---

## 5. Arquitetura do backend

Continuar com arquitetura em camadas, sem replicar dependências do código da QuebraNunca.

```text
LongBeach.Api
    HTTP, autenticação, autorização, binding e status codes

LongBeach.Application
    casos de uso, DTOs, validações e interfaces

LongBeach.Domain
    entidades, enums, regras e invariantes

LongBeach.Infrastructure
    EF Core, PostgreSQL, arquivos, notificações e integrações

LongBeach.Contracts
    contratos públicos e eventos de integração
```

O produto será um monólito modular.

Módulos lógicos:

```text
Identity
Arena
People
School
Schedule
Groups
OperationalFinance
Infrastructure
Tasks
Files
Notifications
Audit
Imports
Dashboard
Integrations
```

Não criar projetos .NET separados por módulo no início. Manter pastas e namespaces claros dentro das camadas.

---

## 6. Aplicativo mobile

### Estratégia recomendada

Construir uma aplicação React mobile-first que funcione como:

1. aplicação web responsiva;
2. PWA;
3. aplicativo iOS via Capacitor;
4. aplicativo Android via Capacitor.

O aplicativo não deve ser apenas um site dentro de uma WebView.

Funcionalidades nativas planejadas desde o início:

- push notifications;
- câmera para fotos de inspeção, manutenção e comprovantes;
- upload de arquivos;
- funcionamento resiliente com perda de conexão;
- fila local para operações pendentes;
- armazenamento seguro de sessão;
- deep links para aula, cobrança, tarefa e inspeção;
- compartilhamento nativo;
- atualização de estado de rede;
- biometria opcional posteriormente.

### Experiências por perfil

#### Sócio e administrador

- dashboard;
- agenda;
- financeiro operacional;
- alunos;
- infraestrutura;
- pendências;
- aprovações.

#### Gestor

- operação diária;
- turmas;
- agenda;
- cobranças;
- tarefas;
- manutenção.

#### Professor

- próximas aulas;
- chamada;
- alunos;
- cancelamentos;
- substituições;
- fechamento.

#### Aluno

- agenda pessoal;
- próximas aulas;
- situação da matrícula;
- pagamentos;
- notificações;
- reposições;
- perfil.

A experiência do aluno ajuda o aplicativo a ter utilidade contínua além da administração interna.

---

## 7. Autenticação

O Long Beach terá autenticação própria.

### Web

- access token de curta duração;
- refresh token protegido;
- renovação silenciosa;
- proteção contra XSS e CSRF conforme estratégia escolhida;
- logout centralizado.

### Mobile

- access token de curta duração;
- refresh token em armazenamento seguro nativo;
- renovação silenciosa;
- revogação de dispositivo;
- identificação da instalação;
- push token associado ao dispositivo.

### Futuro

Uma integração com QuebraNunca poderá usar:

- OpenID Connect;
- OAuth 2.0;
- login federado;
- vínculo de identidade por consentimento.

Não compartilhar tabela de usuários ou senha entre os dois produtos.

---

## 8. Identidade e propriedade

Apesar do endereço inicial usar `quebranunca.com.br`, os elementos abaixo devem ser independentes:

- nome do aplicativo;
- ícone;
- marca;
- política de privacidade;
- termos de uso;
- suporte;
- e-mail de contato;
- conta Apple Developer;
- conta Google Play Console;
- certificados de assinatura;
- bundle ID;
- package name;
- chaves de push;
- banco;
- backups;
- ambientes.

Identificadores sugeridos:

```text
iOS Bundle ID:
br.com.longbeacharena.app

Android Application ID:
br.com.longbeacharena.app
```

Não usar um identificador fortemente acoplado à QuebraNunca caso a intenção seja preservar a independência futura.

---

## 9. Domínios e ambientes

### Produção

```text
longbeach.quebranunca.com.br
api.longbeach.quebranunca.com.br
```

### Homologação

```text
staging.longbeach.quebranunca.com.br
api-staging.longbeach.quebranunca.com.br
```

### Local

```text
http://localhost:5173
https://localhost:7xxx
```

### Ambientes separados

- Development;
- Test;
- Staging;
- Production.

Cada ambiente deve possuir:

- banco próprio;
- secrets próprios;
- storage próprio;
- chaves de push próprias;
- URLs próprias;
- logs próprios.

---

## 10. Banco de dados

Banco PostgreSQL exclusivo da Long Beach.

Princípios:

- migrations versionadas;
- nenhuma tabela compartilhada;
- nenhuma consulta ao banco da QuebraNunca;
- chaves públicas não sequenciais quando expostas;
- auditoria em alterações críticas;
- soft delete somente quando houver valor histórico;
- índices para Arena, competência, data e status;
- timestamps em UTC;
- timezone da operação configurada como `America/Sao_Paulo`;
- idempotência em importações, pagamentos e sincronização mobile.

### Preparação para integração futura

Entidades que possam se integrar futuramente podem ter:

```text
ExternalReference
IntegrationSource
IntegrationStatus
LastSynchronizedAt
```

Esses campos não devem ser obrigatórios no núcleo do domínio.

---

## 11. Módulos funcionais

### Foundation

- usuários;
- papéis;
- permissões;
- dispositivos;
- auditoria;
- arquivos;
- notificações;
- configurações da Arena.

### Escola

- alunos;
- professores;
- turmas;
- horários;
- matrículas;
- aulas;
- presença;
- experimental;
- avulso;
- reposição;
- mensalidades;
- pagamentos;
- remuneração do professor.

### Agenda

- aulas;
- grupos fixos;
- locações;
- eventos;
- bloqueios;
- manutenção;
- indisponibilidade;
- conflito de quadra.

### Grupos

- grupo recorrente;
- responsável;
- participantes;
- contrato;
- vigência;
- valor;
- cobrança;
- encontros;
- confirmação.

### Financeiro operacional

- cobranças;
- recebimentos;
- despesas;
- centros de resultado;
- competência;
- caixa;
- investimentos;
- dívidas;
- resultado operacional;
- resultado de caixa.

Não incluir contabilidade, emissão fiscal ou DRE completa na primeira versão.

### Infraestrutura

- áreas;
- ativos;
- utensílios;
- consumíveis operacionais;
- inspeções;
- manutenções;
- melhorias;
- evidências;
- custos;
- visão “Precisa de atenção”.

### Dashboard

- escola;
- agenda;
- grupos;
- financeiro;
- infraestrutura;
- pendências;
- atualização em tempo real ou quase real.

### Importação

- staging das planilhas;
- conciliação;
- conflitos;
- aprovação;
- rastreabilidade da origem.

---

## 12. Operação offline e sincronização

Não implementar um sistema offline completo na primeira entrega.

Preparar o desenho para os casos mais úteis:

- chamada do professor;
- registro de inspeção;
- foto de manutenção;
- conclusão de tarefa.

Estratégia:

```text
Operação recebe ClientOperationId
→ salva localmente
→ tenta enviar
→ API processa de forma idempotente
→ confirma sincronização
→ fila local remove o item
```

Conflitos devem ser explícitos. Não sobrescrever alterações críticas silenciosamente.

---

## 13. Notificações

Criar um módulo próprio, sem depender de WhatsApp na primeira fase.

Canais:

- push;
- e-mail;
- notificação interna;
- WhatsApp futuro.

Eventos iniciais:

- aula próxima;
- aula cancelada;
- alteração de horário;
- mensalidade próxima do vencimento;
- mensalidade vencida;
- tarefa atribuída;
- inspeção vencida;
- manutenção crítica.

O domínio gera o evento. O módulo de notificações decide o canal.

---

## 14. Roadmap revisado

### Fase 0 — Fundação

- repositório;
- solução;
- frontend;
- Capacitor;
- ambientes;
- CI/CD;
- PostgreSQL;
- autenticação;
- papéis;
- auditoria;
- arquivos;
- estrutura de módulos.

### Fase 1 — Importação e Escola

- staging;
- conciliação;
- alunos;
- professores;
- turmas;
- matrículas;
- aulas;
- presença;
- mensalidades;
- pagamentos;
- cálculo do professor.

### Fase 2 — Agenda e grupos

- agenda unificada;
- grupos fixos;
- contratos;
- cobranças;
- encontros;
- conflitos;
- bloqueios.

### Fase 3 — Infraestrutura

- áreas;
- ativos;
- itens;
- inspeções;
- intervenções;
- tarefas;
- fotos;
- custos;
- “Precisa de atenção”.

### Fase 4 — Aplicativos nas lojas

- push;
- câmera;
- secure storage;
- deep links;
- offline básico;
- testes em dispositivos;
- TestFlight;
- Google Play Internal Testing;
- políticas, termos e privacidade;
- submissão às lojas.

### Fase 5 — Dashboard e automações

- dashboard real;
- lembretes;
- cobranças;
- alertas;
- relatórios;
- integrações futuras.

### Depois

- WhatsApp;
- Replay;
- patrocinadores;
- CRM;
- bar;
- PDV;
- estoque comercial;
- PagBank;
- integração com QuebraNunca.

---

## 15. O que fica descartado do plano anterior

- Reaproveitar entidades ou serviços do QuebraNunca.
- Usar o banco da QuebraNunca.
- Evoluir o painel administrativo da Plataforma QuebraNunca.
- Usar grupos, encontros ou atletas do sistema existente.
- Compartilhar autenticação.
- Criar módulos da Long Beach dentro da solução atual.
- Fazer deploy conjunto.
- Compartilhar migrations.
- Compartilhar filas, storage ou logs como dependência obrigatória.

O sistema existente permanece apenas como referência de arquitetura, convenções e aprendizados.

---

## 16. Próximo passo de planejamento

Antes de gerar o primeiro código, produzir:

1. ADR-001 — Long Beach como produto independente.
2. Diagrama C4 de contexto e contêineres.
3. Estrutura inicial do repositório.
4. convenções de backend e frontend;
5. modelo de autenticação web/mobile;
6. modelo de dados da primeira release;
7. backlog da Fase 0;
8. critérios de pronto;
9. estratégia de CI/CD;
10. checklist para App Store e Google Play.

Após aprovação, iniciar o bootstrap técnico sem implementar ainda regras complexas da escola.
