# ADR-016 — Consolidação do repositório local

Data: 26/10/2026. Organização autorizada pelo responsável após auditoria da pasta LongBeach.

## Decisão

`LongBeach/longbeach-os` é o diretório principal de desenvolvimento, com Git independente e remoto oficial `https://github.com/gustavodrager/longbeach.git`. As histórias e branches das duas bases anteriores são preservadas. O checkout não depende dos objetos Git ou worktrees de outro diretório.

O frontend fica em `frontend/`, incluindo web, PWA e shells Android/iOS Capacitor. O backend fica em `backend/`, com solução, SDK, configurações .NET, `src/` e `tests/`. Preservam-se as cinco camadas e as referências entre projetos. `deploy/`, `scripts/`, `tools/`, `docs/` e `.github/` ficam na raiz.

Não há mudança de domínio, namespace, identificador mobile, contrato HTTP, migration ou regra de negócio nesta decisão. O produto continua como monólito modular independente conforme ADR-001.

## Preservação

Histórias Git, patches binários, arquivos locais de código e inventários ficam em `LongBeach/arquivo/consolidacao-2026-10-26/`. Material privado e arquivos ignorados permanecem fora do Git. Trabalho ainda não integrado exige uma mudança própria; a descoberta de uma cópia anterior não autoriza reintroduzir funcionalidades ou deploys antigos.

Frentes operacionais ativas mantêm seus caminhos até uma janela segura. O arquivamento confere alterações posteriores ao inventário e mantém a compatibilidade necessária à operação histórica.

## Releases e verificação

O manifesto de release continua fixando os commits publicados. Os scripts resolvem a fonte no commit selecionado (`app` ou `frontend`), preservando hashes e metadados de artefatos históricos. Um rename local não autoriza substituir a release ou publicar.

Validar frontend/backend, utilitários, importadores, scripts de publicação, reconhecimento dos dois layouts, independência Git e preservação dos originais. Resultados em [consolidação](../operacao/consolidacao-2026-10-26.md).
