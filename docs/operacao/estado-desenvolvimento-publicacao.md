# Estado de desenvolvimento e publicação

Conferência iniciada em 12/11/2026 (Brasília). O estado Git e a implantação são independentes.

## Fonte de trabalho

- Repositório: https://github.com/gustavodrager/longbeach
- Checkout principal: `/Users/gustavo-drager/Works/LongBeach/longbeach-os`.
- Branch de integração: `main`. Criar branches de trabalho neste checkout.
- Frontend: `frontend/`. Backend, solução e SDK: `backend/`.
- `arquivo/` e seu alias `work/` preservam bases históricas; não são destinos de atualizações.
- Configuração privada e backups: `../dados-locais/`. Evidências operacionais: `../evidencias/`.

A revisão #78 integrou a exclusão de turmas com histórico (`24ca888`). A revisão #79 integrou o CI somente PostgreSQL 18 (`d149a82`). O checkout principal foi sincronizado com a main remota. A alteração local anterior em `release-google-vm.json` foi preservada em cópia, patch e stash `preservacao-release-google-vm-20261112`; não deve ser reaplicada como se identificasse a produção atual.

## Destinos existentes

| Componente | Destino |
| --- | --- |
| Projeto Google | `parsero-prod-20261022`, conta operacional Parsero |
| API | VM `longbeach-economy`, zona `southamerica-east1-a` |
| API pública | https://api.longbeach.quebranunca.com.br |
| Frontend | Firebase Hosting, site `parsero-prod-20261022` |
| Site público | https://longbeach.quebranunca.com.br |
| Banco | PostgreSQL 18 na VM, schema 36 observado em 12/11 |

## Publicação em andamento

Fonte candidata: `d149a82dcfbd90db15565f6881ff6e7bea78562c`.
Pipeline: https://github.com/gustavodrager/longbeach/actions/runs/43337610172

O environment Production permite `main` e mantém aprovação obrigatória. `release-images.yml` testa e publica imagens OCI; ele **não faz deploy** da VM ou do Firebase. Só promover os artefatos do commit aprovado, por digest, após conferir a versão realmente instalada.

A observação inicial confirmou API, PostgreSQL, Caddy e WhatsApp saudáveis e preflight aprovado. O banco tem 36 migrations, até `20261106150000_BarSalesWithoutStock`; a candidata usa o mesmo schema. Nenhuma migration é necessária para esta release.

Não interpretar o sucesso do merge ou da geração de imagens como atualização de produção. A implantação e a validação final ainda precisam de registro próprio.

## Procedimento para próximas conversas

1. Ler este documento e `AGENTS.md`, conferir `git status`, remotes, branch e SHA antes de editar.
2. Preservar alterações locais antes de trocar branch; executar `git fetch origin` e comparar com `origin/main`.
3. Integrar a mudança revisada na main e fixar o SHA que será publicado.
4. Executar `release-images.yml` em main/Production e cumprir a aprovação existente.
5. Conferir VM/Firebase ao vivo; promover API e depois frontend preservando configuração, banco e integrações. Mudança de schema exige revisão própria.
6. Registrar SHA, run, digests, versão Firebase, validações e limitações. Atualizar este índice para apontar ao recibo final.

Os documentos antigos de Railway, Cloud Run/Cloud SQL e os manifestos de outubro são históricos. Não reaplicar infraestrutura antiga para publicar uma atualização normal.
