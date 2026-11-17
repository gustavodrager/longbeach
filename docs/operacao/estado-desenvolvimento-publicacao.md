# Estado de desenvolvimento e publicação

Estado conferido em 17/11/2026 (Brasília). O estado Git e a implantação são independentes.

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

## Publicação concluída

Fonte publicada de API e interface: `00a1ab5b3b872ca284393ccad3f047a73184313b` (PR #86, botão menos para atendentes com devolução ao estoque e histórico).
Pipeline: https://github.com/gustavodrager/longbeach/actions/runs/44150940896

API e frontend publicados e verificados em 17/11/2026 (Brasília), após autorização explícita do proprietário e aprovação de Production. A API foi promovida antes da interface, por digest. O [recibo desta release](release-menos-atendentes-2026-11-17.json) registra os artefatos e as verificações. Os 113 arquivos públicos correspondem ao artefato aprovado. PostgreSQL, Caddy e WhatsApp conservaram seus containers; configurações privadas preservadas. Zero migrations; schema 36 mantido.

Validação oficial: 736 testes unitários, 753 de integração e 1484 de frontend aprovados, além do gate do WhatsApp. O atendente pode usar apenas a retirada unitária com devolução obrigatória, sem receber supervisão geral. A API está saudável; as rotas privadas e a nova retirada rejeitam acesso anônimo com HTTP 401. Não foram lançados produtos ou pagamentos reais para testar produção; o tablet físico ainda não foi conferido.

O environment Production permite `main` e mantém aprovação obrigatória. `release-images.yml` testa e publica imagens OCI; ele **não faz deploy** da VM ou do Firebase. A implantação promove os artefatos aprovados por digest. Não confundir sucesso de merge ou build com atualização de produção.

A release anterior, do botão menos com supervisão, está em [release-retirada-toque-2026-11-17.json](release-retirada-toque-2026-11-17.json).

## Ferramenta Google Cloud local

O Google Cloud SDK 593.0.0 foi recuperado da distribuição oficial para `../dados-locais/ferramentas/google-cloud-sdk/`. Os caminhos antigos em `/private/tmp/*release*-tools/` deixaram de existir e não devem ser tratados como instalação permanente. A instalação não contém credenciais nem pertence ao Git da aplicação. Usar a conta operacional Parsero explicitamente; preservar as credenciais individuais existentes.

## Procedimento para próximas conversas

1. Ler este documento e `AGENTS.md`, conferir `git status`, remotes, branch e SHA antes de editar.
2. Preservar alterações locais antes de trocar branch; executar `git fetch origin` e comparar com `origin/main`.
3. Integrar a mudança revisada na main e fixar o SHA que será publicado.
4. Executar `release-images.yml` em main/Production e cumprir a aprovação existente.
5. Conferir VM/Firebase ao vivo; promover API e depois frontend preservando configuração, banco e integrações. Mudança de schema exige revisão própria.
6. Registrar SHA, run, digests, versão Firebase, validações e limitações. Atualizar este índice para apontar ao recibo final.

Os documentos antigos de Railway, Cloud Run/Cloud SQL e os manifestos de outubro são históricos. Não reaplicar infraestrutura antiga para publicar uma atualização normal.
