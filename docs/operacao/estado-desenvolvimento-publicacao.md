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

Interface publicada: `bbf717d537cb1d399ee2f244f85afdbf23e3eb75` (PR #84, botão menos na venda direta com devolução de estoque).
Pipeline: https://github.com/gustavodrager/longbeach/actions/runs/44132918995

Frontend publicado e verificado em 17/11/2026 (Brasília). A API permanece na fonte `6cb940bf82e6cab013ff9e67c8f3ce110499d773` e no mesmo digest, sem reinício: o diff completo confirma que o runtime não mudou, e os endpoints existentes atendem ao novo fluxo. O [recibo desta release](release-retirada-toque-2026-11-17.json) identifica ambas as fontes, digests, versão Firebase e verificações. Os 113 arquivos públicos correspondem ao artefato aprovado. API, PostgreSQL, Caddy e WhatsApp conservaram seus containers e configurações. Zero migrations; schema 36 preservado.

Validação oficial: 736 testes unitários, 749 de integração e 1483 de frontend aprovados, além do gate do WhatsApp. A API está saudável e a rota privada rejeita acesso anônimo com HTTP 401. A retirada e sua retomada sem devolução duplicada foram conferidas localmente com dados fictícios. Não foram lançados produtos ou pagamentos reais para testar produção; o tablet físico ainda não foi conferido.

O environment Production permite `main` e mantém aprovação obrigatória. `release-images.yml` testa e publica imagens OCI; ele **não faz deploy** da VM ou do Firebase. A implantação promove os artefatos aprovados por digest. Não confundir sucesso de merge ou build com atualização de produção.

A release anterior, de venda direta por toque, está em [release-venda-direta-2026-11-17.json](release-venda-direta-2026-11-17.json).

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
