# Long Beach OS

Aplicação principal da Long Beach Arena: frontend React/TypeScript/Vite, PWA e Capacitor; backend .NET em monólito modular; PostgreSQL e migrations próprios.

## Estrutura

```text
frontend/       React, PWA, Android e iOS (Capacitor)
backend/
  src/          Api, Application, Domain, Infrastructure e Contracts
  tests/        Testes unitários, integração e fixtures
  LongBeach.sln
  global.json   SDK .NET fixado
  Directory.Build.props
deploy/        Docker, Google Cloud/Firebase e infraestrutura
scripts/        Importadores, auditoria SQL e identidade visual
tools/          Utilitários locais com execução explícita
docs/           Arquitetura, decisões e operação
.github/        CI e publicação de imagens
```

Importações, backups, configurações privadas e evidências ficam fora deste repositório, nas pastas de suporte do diretório LongBeach. As cópias anteriores são preservadas como histórico. Comece por [estrutura local](docs/operacao/estrutura-local.md) e [registro da consolidação](docs/operacao/consolidacao-2026-10-26.md).

## Desenvolvimento e validação

Requisitos: SDK de `backend/global.json`, Node.js 24 e pnpm 11.25. PostgreSQL 17 e 18 são cobertos no CI; preserve a versão principal do volume local existente.

```bash
cd backend
dotnet restore LongBeach.sln
dotnet build LongBeach.sln --configuration Release --no-restore
dotnet test LongBeach.sln --configuration Release --no-build
cd ..
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend test
pnpm --dir frontend build
```

Os conversores de planilhas usam Python e a dependência fixada em `scripts/requirements.txt`:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements.txt
.venv/bin/python -m unittest discover -s scripts -p 'test_*.py'
```

Os testes PostgreSQL exigem `LONG_BEACH_TEST_DATABASE_URL` em um banco exclusivo de teste. Consulte [estrutura local](docs/operacao/estrutura-local.md).

Para abrir o ambiente local existente, use `iniciar-local.command` na pasta principal LongBeach. A configuração privada fica fora do Git; migrations e seeds desse ambiente continuam sendo operações explícitas.

Para um ambiente de desenvolvimento novo, com dados fictícios e volume próprio:

```bash
cp .env.example .env
# Configure credenciais próprias de desenvolvimento no .env.
docker compose up --build
```

Esse Compose usa PostgreSQL 17. Web: `http://localhost:4173`; API: `http://localhost:5100`; prontidão: `/health/ready`. Upgrade major de um volume existente exige migração própria.

`frontend/.env.example` documenta as opções públicas da interface. Conexões, JWT e demais secrets pertencem ao ambiente da API. O identificador mobile continua `br.com.longbeacharena.app`.

## Arquitetura e publicações

Consulte a [ADR-001](docs/adr/ADR-001-produto-standalone.md), as [convenções](docs/arquitetura/convencoes-backend-frontend.md) e a [ADR-016](docs/adr/ADR-016-consolidacao-do-repositorio-local.md).

O [manifesto de fontes Google](deploy/google/source-revisions.json) fixa os commits da release registrada em 25/10/2026. O build web reconhece `app/` dos commits antigos e `frontend/` dos novos. A organização local preserva o manifesto e a identidade dos artefatos publicados.

A [ADR-015](docs/adr/ADR-015-google-vm-economia.md) e o [runbook da VM](docs/operacao/google-vm.md) registram a evolução econômica da hospedagem. Consulte os recibos finais da operação para seu estado de implantação. `estado-atual.md`, `release-producao.json` e `.railway/` permanecem como fotografias históricas datadas.

CI testa frontend/backend. A publicação de imagens exige o environment escolhido e não executa deploy. A consolidação local preserva regras de negócio, migrations e dados.
