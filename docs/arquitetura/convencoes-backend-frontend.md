# Convenções de backend e frontend

## Princípios gerais

- Código e nomes técnicos em inglês; textos da interface, mensagens de negócio e documentação operacional em português do Brasil.
- Cada regra tem uma única autoridade no backend. O frontend pode antecipar validações para usabilidade, mas nunca substitui a validação da API.
- Datas técnicas em UTC (`timestamptz`); datas civis, como nascimento ou competência, usam tipos sem horário. A arena opera em `America/Sao_Paulo`.
- IDs públicos são UUID v7. Identificadores importados ficam em campos de referência e nunca viram chave primária.
- Nenhum package, namespace, secret ou chamada de runtime depende da Plataforma QuebraNunca.
- Complexidade deve ser justificada por um caso real. O padrão inicial é monólito modular, request/response HTTP e outbox no PostgreSQL.

## Backend .NET

### Dependências entre projetos

```text
LongBeach.Domain            -> nenhuma camada da solução
LongBeach.Contracts         -> tipos públicos estáveis, sem EF ou domínio
LongBeach.Application       -> Domain e Contracts
LongBeach.Infrastructure    -> Application e Domain
LongBeach.Api               -> Application, Infrastructure e Contracts
```

Dependências inversas entram como interfaces na Application. Infrastructure implementa persistência, arquivos, relógio, e-mail, push e outros adapters. Domain não conhece ASP.NET, Entity Framework, JSON, banco ou provider.

### Organização por módulo

Cada camada usa as mesmas pastas lógicas quando aplicável:

```text
Identity/ Arena/ People/ School/ Schedule/ Groups/
OperationalFinance/ InfrastructureAssets/ Tasks/ Files/
Notifications/ Audit/ Imports/ Dashboard/ Integrations/
```

`InfrastructureAssets` é o namespace técnico do módulo de infraestrutura física, para não colidir com o projeto `LongBeach.Infrastructure`.

### Domínio

- Entidades protegem invariantes em métodos; setters públicos são evitados.
- Value objects representam CPF quando necessário, telefone normalizado, dinheiro/moeda, competência e intervalos.
- `decimal` representa valores monetários; nunca `double` ou `float`.
- Regras que precisam de I/O pertencem a casos de uso, não às entidades.
- Eventos de domínio descrevem fatos no passado e não enviam notificações diretamente.
- Exclusão lógica só existe quando histórico e reativação têm valor; razão financeira e auditoria são imutáveis.

### Application

- Um caso de uso por comando ou consulta, com nome que expresse intenção: `CreateEmployee`, `RecordStockMovement`, `ListStudents`.
- Validação sintática na borda e validação de negócio no caso de uso/domínio.
- Toda operação de escrita recebe ator e correlation ID; operações repetíveis recebem `Idempotency-Key` ou `ClientOperationId`.
- Paginação é obrigatória em coleções potencialmente crescentes; cursores são preferidos para histórico, offset é permitido em cadastros pequenos.
- Resultados esperados usam códigos de erro tipados; exceções ficam para falhas inesperadas.

### API HTTP

- Base: `/api/v1`.
- Recursos em substantivos plurais; ações explícitas apenas quando não forem CRUD, por exemplo `/auth/refresh` e `/stock-movements`.
- JSON em `camelCase`; enums publicados como strings estáveis.
- Erros seguem RFC 9457 Problem Details com `type`, `title`, `status`, `detail`, `instance`, `code`, `traceId` e erros de campo quando aplicável.
- Respostas não expõem entidades EF, hashes, tokens, stack traces ou dados de outros escopos.
- `201` com `Location` para criação, `204` para atualização sem corpo, `409` para conflito de versão/idempotência e `422` para regra de negócio válida sintaticamente.
- `ETag`/versão de entidade protege edições concorrentes nos fluxos em que sobrescrita causaria perda.
- CORS usa allowlist exata por ambiente. TLS é obrigatório fora de Development.
- OpenAPI é publicado em Development/Test, protegido em Staging e desabilitado ou protegido em Production.

### Persistência

- EF Core migrations versionadas são a fonte oficial do schema.
- Configurações de entidade ficam em Infrastructure; nenhuma annotation de persistência entra no Domain.
- Nomes físicos em `snake_case`; índices e constraints têm nomes explícitos.
- Operações críticas, outbox e auditoria são gravadas na mesma transação quando possível.
- Queries de leitura usam projeção e `AsNoTracking`; evitar N+1 e carregamento de grafos completos.
- Migration de produção segue expand-and-contract: adicionar, popular, trocar leitura/escrita e só então remover em release posterior.
- Seed de produção contém somente dados de referência, nunca usuário padrão ou senha.

### Segurança e observabilidade

- Autorização por policies e permissões; não espalhar comparações de nome de papel pelos controllers.
- Secrets vêm do provedor/variáveis do ambiente e nunca de `appsettings*.json` versionado.
- Logs estruturados incluem `traceId`, `userId` quando permitido, módulo, ação e duração; excluem senha, token, endereço completo e payload sensível.
- Auditoria de negócio é diferente de log técnico e possui retenção própria.
- `/health/live` prova processo vivo; `/health/ready` verifica dependências necessárias sem revelar detalhes ao público.

### Testes backend

- Unitários: invariantes, políticas, cálculos e casos de uso sem I/O.
- Integração: API real + PostgreSQL real efêmero, migrations desde zero, autenticação/autorização e concorrência.
- Contrato: OpenAPI compatível e exemplos de Problem Details.
- Migração: importação idempotente e reconciliação com fixtures anonimizadas.
- Não substituir PostgreSQL por provider in-memory nos testes que verificam persistência.

## Frontend React/TypeScript/Vite

### Organização

```text
src/
├── app/             # bootstrap, providers, router e layout
├── features/        # auth, students, staff, projects, inventory...
├── shared/
│   ├── api/         # cliente HTTP e contratos gerados
│   ├── components/  # design system reutilizável
│   ├── hooks/
│   ├── lib/
│   └── styles/      # tokens e temas
├── pwa/             # service worker, atualização e conectividade
└── test/            # harness e factories
```

- Features não importam internals de outras features; promovem código compartilhado apenas quando houver reutilização real.
- Contratos da API são gerados do OpenAPI ou mapeados numa borda tipada. Não duplicar enums manualmente em várias telas.
- `strict` permanece ativo; `any`, non-null assertions e casts precisam de justificativa local.
- Componentes preferem composição, props pequenas e estado local. Estado remoto pertence ao TanStack Query.

### Dados, formulários e erros

- TanStack Query controla cache, invalidação e revalidação; chaves ficam próximas à feature.
- Formulários usam React Hook Form e schema de validação consistente, inicialmente Zod.
- Mutation exibe progresso, impede duplicidade e preserva valores após erro.
- Optimistic update é usado somente quando há compensação segura.
- `401` tenta uma renovação coordenada; falha encerra a sessão. `403` mostra falta de permissão sem apagar dados locais do formulário.
- Problemas de campo vindos da API são associados ao respectivo controle.
- Horários são formatados para `America/Sao_Paulo`; valores usam `pt-BR` e BRL, preservando o valor numérico recebido.

### UX, responsividade e acessibilidade

- Mobile mostra tarefa principal e resumo; desktop pode adicionar tabelas e contexto, sem esconder funções essenciais no mobile.
- Navegação, formulários e modais funcionam por teclado; foco é devolvido ao acionador.
- Alvo mínimo de toque, contraste AA, labels visíveis, estados vazios, carregamento e erro são parte do componente.
- A identidade existente serve como ponto de partida, transformada em tokens revisados da Long Beach.
- PWA comunica atualização disponível; não ativa novo service worker no meio de um formulário sem consentimento.
- Operação offline só é habilitada para fluxos documentados e idempotentes. Não prometer offline onde os dados exigem conexão.

### Capacitor

- O mesmo frontend fornece web/PWA e shell mobile, com adapters para câmera, conectividade, push, deep links e secure storage.
- Plugins Capacitor ficam atrás de interfaces próprias e têm fallback web quando aplicável.
- Access token permanece em memória; refresh token mobile usa armazenamento seguro nativo.
- Bundle/Application ID: `br.com.longbeacharena.app`.
- Configurações e ícones por ambiente evitam apontar um build de teste para Production.

### Testes frontend

- Vitest: funções puras, hooks e componentes com comportamento relevante.
- Testing Library: fluxos pelo papel e nome acessível, sem testar implementação interna.
- Playwright: login, autorização, cadastros críticos, sessão expirada e regressão responsiva.
- Build PWA e sincronização Capacitor fazem parte do pipeline; testes em dispositivos entram antes de cada release de loja.

## Qualidade e revisão

Uma mudança está pronta para revisão quando formatação, lint, typecheck, build e testes aplicáveis passam localmente; OpenAPI e migrations estão atualizados; nenhum secret ou dado pessoal foi incluído; e a documentação foi ajustada quando o comportamento mudou.
