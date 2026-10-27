# Atualidade e pendências das pastas antigas — 27/10/2026

> Retrato histórico anterior à integração seletiva de estoque e materiais. As referências a código “atual”, publicação, branches, remoto e PR descrevem o momento desta auditoria. Os achados e as evidências abaixo foram preservados; não constituem uma nova consulta ao GitHub ou ao ambiente publicado.

## Resultado

`longbeach-os` contém o código mais recente da aplicação publicada registrada. O frontend e o backend são idênticos ao commit de publicação `7179c9fad657327d2bd9cc4dfa2e750180dedebf`; o HEAD `acea628` acrescenta registros da release. As alterações locais anteriores a esta auditoria são documentais, referentes à organização e ao retorno de outputs.

A comparação das nove áreas antigas encontrou duas contribuições importantes ainda não incorporadas: uma proteção de integridade do catálogo do Bar e a evolução do controle de materiais da Arena. Elas estão em `arquivo/ambientes-anteriores/longbeach-perfis`, como trabalho local preservado. Não representam uma versão publicada mais recente ou um pacote pronto para copiar.

## Evolução posterior nesta branch

As duas primeiras prioridades deste retrato foram incorporadas seletivamente em `codex/estoque-materiais-20261027`:

- A proteção do catálogo Bar passou a considerar o uso do produto antes de permitir alteração da unidade-base ou de `ControlsStock`, preservando os fluxos modernos de cadastro e estoque.
- O controle de materiais recebeu movimentações tipadas, histórico relacional, versão esperada, reenvio com a mesma operação, permissões e proteção do saldo no cadastro. O frontend atual foi adaptado; os arquivos e migrations históricos não foram copiados integralmente.

O [registro da integração de estoque e materiais](integracao-estoque-materiais-2026-10-27.md) reúne o escopo resultante, as validações e as condições para execução local. Esta evolução da branch não implica merge no GitHub, atualização da prévia ou publicação em produção. As pendências e recomendações das seções seguintes permanecem como evidência da auditoria original.

## Situação do GitHub

O remoto foi atualizado e consultado nesta auditoria. A branch `codex/consolidacao-estrutura-20261026` está em `acea628`, igual ao HEAD local; nenhuma branch remota tem commit mais recente. O [PR 47](https://github.com/gustavodrager/longbeach/pull/47) está **aberto**, com base em `codex/google-cloud-production-base-20261022`, e ainda não foi integrado.

A branch padrão oficial `main`, em `933161b`, é ancestral e está 230 commits atrás do HEAD atual. A referência local `origin/HEAD` ainda aponta para uma branch antiga de notas. Portanto, a aplicação local e a publicação estão atualizadas, enquanto a integração das branches e a referência padrão do repositório precisam de organização própria. Revisar a cadeia de PRs e a validação antes de integrar o código atual à branch padrão. Esta auditoria não alterou branches, mergeou PRs ou publicou artefatos.

## Pendências, em ordem de revisão

| Ordem | Contribuição antiga | Situação atual | Encaminhamento |
| --- | --- | --- | --- |
| 1 | Bloqueio de alteração de unidade-base e controle de estoque de produto Bar já utilizado | O servidor atual bloqueia troca de unidade vinculada a ingrediente de receita, mas não cobre todo o histórico/saldo/compra/venda/comanda nem a troca de `ControlsStock` | Recuperar a regra seletivamente, com testes e revisão de concorrência. Não exige migration. |
| 2 | Entradas, consumo, perdas, contagem e comprovantes imutáveis de materiais | O cadastro de materiais já existe; falta o incremento de movimentação auditável, com permissão específica e proteção contra edição direta do saldo | Integrar como mudança própria de backend e frontend, com migration nova sobre o modelo atual e ensaio local. |
| 3 | Ajuste rápido antigo do estoque Bar | Sobrepõe edição atual do disponível, edição conjunta produto/estoque e inventários. O comando antigo usa quantidade física, com semântica diferente | Reavaliar apenas requisitos ainda úteis, como justificativa e comprovante; evitar dois comandos concorrentes para a mesma ação. |
| 4 | Registros antigos de publicação e suporte | Há documentação exclusiva de Despesas, vínculo Google e homologação PagBank preservada no arquivo | Manter como histórico ou indexar trechos úteis. Não restaurar configurações Railway nem interpretar ensaios antigos como homologação atual. |

### 1. Integridade do catálogo Bar

Origem: `arquivo/ambientes-anteriores/longbeach-perfis/src/LongBeach.Infrastructure/Bar/BarCatalogService.cs`, método `SaveProduct`, e `tests/LongBeach.IntegrationTests/BarCatalogIntegrityPostgresTests.cs`.

A regra antiga verifica saldo/reserva, movimentos, inventário, compras, vendas, comandas e receitas antes de permitir mudar a unidade ou o controle de estoque. Ela evita reinterpretar quantidades históricas de um produto já utilizado. O principal permite uma proteção mais limitada em `backend/src/LongBeach.Infrastructure/Bar/BarCatalogService.cs:70`; o domínio atribui os novos valores sem consultar esse uso.

Preservar as evoluções atuais: categoria padrão, código automático, trava de categorias e edição auditada de produto/estoque. O arquivo antigo completo removeria essas melhorias. Adaptar os testes antigos e cobrir também concorrência, histórico com saldo zerado, reservas e produto nunca utilizado. O achado é uma lacuna de proteção no código; esta auditoria não constatou dano em dados de produção.

### 2. Evolução do controle de materiais

Hoje, `frontend/src/pages/OperationsPages.tsx` já oferece cadastro, filtros e ficha dos materiais, com saldo em `operational_records`. O incremento antigo acrescenta:

- Entrada, consumo, perda e contagem física, com motivo, destino, operador e saldos antes/depois.
- Histórico relacional imutável em `material_movements`, mantendo o histórico JSON anterior.
- Identificador de operação para impedir duplicidade, versão esperada e tratamento de conflito/reenvio na interface.
- Permissão `inventory:adjust` para contagem e guarda no endpoint genérico para impedir alteração direta de saldo, unidade e histórico.

Fontes principais em `longbeach-perfis`: `app/src/features/operations/MaterialStockPanel.tsx`, `materialStock.ts`, `src/LongBeach.Api/Endpoints/MaterialEndpoints.cs`, `src/LongBeach.Infrastructure/Inventory/MaterialStockService.cs`, regras/contratos/modelo de Inventory, `docs/adr/ADR-010-integridade-estoque-e-materiais.md` e `docs/operacao/materiais-consumo.md`.

Há testes unitários, de integração e de interface, mas a implementação foi registrada em 13/10 como local e não publicada. Sua execução anterior não comprova compatibilidade com a aplicação atual. Validar em banco descartável local, preservar os dados existentes, adaptar integrações compartilhadas e gerar migration aditiva nova a partir das 27 migrations canônicas. Não copiar o snapshot antigo nem substituir arquivos compartilhados inteiros.

Esse incremento não implementa empréstimos, patrimônio individual, compras da Arena, contas a pagar ou transferências entre locais. Os saldos antigos continuam exigindo reconciliação física quando necessária; a atualização não deve fabricar uma entrada inicial ou declarar os dados conciliados.

## O que já está resolvido ou foi substituído

- C6, Visão Geral e Despesas já foram incorporados, inclusive por commits equivalentes ou integração adaptada. Hash de commit diferente não indica funcionalidade faltante.
- Notas recebidas e finalidade da compra já existem. As migrations antigas `20261013204739_ReceivedInvoices` e `20261013211209_InvoicePurpose` divergem do histórico atual e não devem ser aplicadas.
- A conciliação manual financeira e `BillingService.Settlements.cs` foram retirados por decisão registrada em 25/10. Sua ausência é deliberada; os históricos permanecem preservados.
- Código antigo de EDI/pagamentos antecede o modo atual de importação e a pausa das APIs bancárias. Copiá-lo reintroduziria comportamentos superados.
- O frontend e o backend das bases Google Cloud/VM coincidem com o principal após normalização dos diretórios; diferenças de projeto de testes decorrem do caminho da auditoria SQL.
- Os quatro utilitários antigos têm correspondentes em `tools/`, com parâmetros e guardas explícitos para uso local. Não foram identificados preparadores funcionais ausentes nessa comparação.
- Os quatro arquivos extras de `google-local/payments-preview` são uma prévia isolada com dados fictícios e a tela de recebimentos já existente. Servem como material opcional de QA; não acrescentam funcionalidade publicada.

## Cobertura e evidências

Foram revisadas as nove áreas: `longbeach-c6`, `longbeach-current-finance`, `longbeach-despesas`, `longbeach-economy-vm`, `longbeach-edi-fix`, `longbeach-google-cloud`, `longbeach-notas-release`, `longbeach-perfis` e `longbeach-visao-geral`. A comparação normalizou `app/ → frontend/`, `src/ → backend/src/` e `tests/ → backend/tests/`, cruzando conteúdo, histórico, rotas, regras e testes existentes.

O inventário anterior de 108 alterações locais/69 conteúdos candidatos de perfis foi reavaliado; esses números não representam funcionalidades diferentes. Os originais permanecem preservados. A evidência detalhada desta auditoria fica em `LongBeach/arquivo/consolidacao-2026-10-26/auditoria-atualidade-2026-10-27/`, com relatórios Git/backend/frontend e inventário privado de documentos e ferramentas.

Validação desta etapa: comparação estática de código e histórico, consulta atual do remoto/PR, conferência da identidade do código publicado e revisão dos testes existentes. Os incrementos antigos ainda precisam de testes executados na base atual antes de incorporação. Nenhum código funcional, banco ou runtime foi alterado pela auditoria.
