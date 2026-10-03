# Long Beach OS

Base standalone para a operação da Long Beach Arena. O produto reúne uma API .NET, uma aplicação React/PWA, clientes móveis Capacitor e um PostgreSQL exclusivo.

O projeto não compartilha código, banco, API, autenticação, migrations, storage ou deploy com outros produtos. O painel legado continua independente durante a transição.

## Estrutura

- `src/LongBeach.Api`: entrada HTTP, autenticação, autorização e health checks.
- `src/LongBeach.Application`: casos de uso e contratos internos.
- `src/LongBeach.Domain`: modelo e regras de domínio.
- `src/LongBeach.Infrastructure`: PostgreSQL, segurança e auditoria.
- `src/LongBeach.Contracts`: contratos públicos da API.
- `tests`: testes unitários e de integração.
- `app`: React, TypeScript, Vite, PWA e Capacitor.
- `docs`: decisões, arquitetura, migração e operação.
- `deploy`: imagens OCI e servidor estático do frontend.

Leia primeiro a [ADR-001](docs/adr/ADR-001-produto-standalone.md), os [diagramas C4](docs/arquitetura/C4-contexto.md) e o [plano de transição](docs/migracao/plano-transicao-e-rollback.md).

## Desenvolvimento local com contêineres

Requisitos: Docker com Compose.

```bash
cp .env.example .env
# Troque as credenciais de desenvolvimento no arquivo .env.
docker compose up --build
```

A aplicação web fica em `http://localhost:4173`, a API em `http://localhost:5100` e o health check em `http://localhost:5100/health`. O PostgreSQL usa um volume próprio chamado `longbeach_postgres_data`.

O usuário administrador inicial é opcional. Para criá-lo, defina `LONG_BEACH_BOOTSTRAP_ADMIN_EMAIL` e `LONG_BEACH_BOOTSTRAP_ADMIN_PASSWORD` no `.env`; essa inicialização só funciona no ambiente Development.

## Desenvolvimento sem contêineres

Requisitos: .NET SDK 10.0.401, Node.js 24, pnpm 11.25 e PostgreSQL 17.

```bash
dotnet restore LongBeach.sln
dotnet build LongBeach.sln --configuration Release --no-restore
dotnet test LongBeach.sln --configuration Release --no-build

pnpm --dir app install --frozen-lockfile
pnpm --dir app test
pnpm --dir app build
```

Use `app/.env.example` como referência para o frontend. Credenciais e chaves reais devem ficar no secret store local ou no cofre do ambiente.

## CI/CD e ambientes

O workflow de CI testa backend e frontend em pull requests e em `main`. O workflow manual de release publica imagens OCI da API e da web no GitHub Container Registry, protegido pelo environment escolhido: `Development`, `Test`, `Staging` ou `Production`. Ele não executa deploy.

Antes de publicar, configure em cada GitHub Environment:

- a variável `LONG_BEACH_PUBLIC_API_URL` com a URL pública da API daquele ambiente;
- regras de proteção e responsáveis, especialmente para `Staging` e `Production`;
- permissão do repositório para publicar pacotes no GitHub Container Registry.

Conexões de banco, chaves JWT, storage e demais secrets são configurados somente no runtime do provedor escolhido. A estratégia completa está em [CI/CD e ambientes](docs/operacao/ci-cd-e-ambientes.md).

Na produção web, configure `Authentication__CookieDomain=longbeach.quebranunca.com.br`. Esse domínio é usado somente pelo cookie anti-CSRF legível pela aplicação; o refresh token permanece em cookie `HttpOnly` restrito a `api.longbeach.quebranunca.com.br`. O procedimento completo está no [runbook do Railway](docs/operacao/deploy-railway-production.md).

O modo temporário sem login está descrito em [modo de teste público](docs/operacao/modo-demo-publico.md). Ele deve permanecer limitado a conteúdo fictício e interfaces sem escrita operacional.

## Estado deste bootstrap

Esta base prepara desenvolvimento, testes e publicação de imagens. Nenhum ambiente hospedado novo, DNS ou banco de produção é criado por estes arquivos. O sistema atual permanece disponível até o novo produto cumprir os critérios de paridade, reconciliação e rollback documentados.
