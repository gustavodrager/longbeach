# Correção do diálogo de materiais — 27/10/2026

A correção somente web da fonte `90dc344ae448b584de45cddc3021c13380c82991` foi publicada no Firebase às 19h05m31.269s UTC (16h05m31 de Brasília). A API permanece registrada na fonte `b71dbf22127a6475b91770ba8f643df7933330b9`, com schema 28. O [registro atual da release](release-google-vm.json) separa as fontes e aprovações dos dois componentes.

## Causa e correção

Na ficha de um material, `MaterialStockPanel` e `MaterialStockHistory` eram irmãos com a mesma chave React, composta pela sessão e pelo ID do material. Ao digitar ou atualizar os dados em segundo plano, a reconciliação podia duplicar o diálogo e perder o rascunho. A falha observada no navegador foi reproduzida localmente com dados sintéticos, sem envio de movimentos.

A alteração mínima acrescenta namespaces distintos às chaves do painel (`movement:`) e do histórico (`history:`). A regressão permanente monta a ficha real com DataRouter, `UnsavedChangesProvider` e `DemoDataProvider`; confere um único diálogo, quantidade/motivo/destino/tipo preservados após digitação e três refreshes por focus, além de fechar e reabrir sem nós órfãos. Todas as consultas do teste são GETs simulados; nenhuma confirmação é enviada.

O teste falhou antes do fix e passou depois. Os 24 testes afetados passaram; a suíte frontend completa aprovou 573 testes em 60 arquivos. Os builds frontend e Release da solução passaram, sem inicializar API ou banco.

Após ativar o PWA publicado, a conferência autenticada com a sessão Google existente passou no navegador interno e no Chrome. A janela permaneceu única e os três campos conservaram seus valores por mais de 37 segundos. No Chrome, o descarte foi confirmado pela interface nativa do navegador: nenhum diálogo permaneceu, a reabertura apresentou campos vazios e o fechamento seguinte também não deixou janelas pendentes. Os rascunhos foram descartados sem confirmação de movimentação ou edição de cadastro; saldo e histórico observados permaneceram iguais. O recibo privado `browser-postfix-check.json` separa essas provas das limitações do controle automático de confirmações do navegador.

## Publicação e prova atual

O proprietário autorizou corrigir, testar e publicar sem alterar dados reais. O workflow `release-images.yml`, [run40563887143](https://github.com/gustavodrager/longbeach/actions/runs/40563887143), concluiu os quatro checks com sucesso e recebeu a revisão do proprietário no environment Production para a fonte 90dc344. A aprovação da implantação anterior da API b71 pertence ao run40542381209; o novo gate não representa nova publicação da API.

| Registro web | Valor |
| --- | --- |
| Versão Firebase | `sites/parsero-prod-20261022/versions/ae06ef2686f65734` |
| Release | `sites/parsero-prod-20261022/channels/live/releases/1793127931269000` |
| Publicação UTC | `2026-10-27T19:05:31.269Z` |
| Verificação pública concluída | `2026-10-27T19:06:00.384856Z` |
| SHA-256 da árvore pública | `a01b0bf154822a691133f07c31632e8e2069f9f0a541d25756b6453a8dca10e9` |
| Conferência | 73 arquivos iguais ao artefato, seis rotas SPA, headers/TLS e configuração Firebase preservados; metadados privados não expostos |

A prova atual da API nesta operação é somente GET `/health/ready` com resposta 200. Não houve reinspeção da VM, dos contêineres ou dos hashes do banco, nem novo backup, migration ou restauração. Os recibos da implantação b71, incluindo preservação dos dados antes da abertura e ensaio do schema 27→28, permanecem históricos e intactos, conforme o [registro daquela publicação](publicacao-estoque-materiais-2026-10-27.md).

Evidências privadas ficam em `LongBeach/evidencias/correcao-dialogo-materiais-2026-10-27/`; a reprodução e os logs antes/depois estão em `LongBeach/evidencias/verificacao-estoque-materiais-2026-10-27/`. O registro da release contém os hashes, sem credenciais, dados pessoais ou dumps.

## Retorno

O ponto anterior da web é `sites/parsero-prod-20261022/versions/001ec4e450b73ac6`. Um retorno exige revisão e atua somente no Firebase, mantendo a API b71 e o schema 28; essa versão anterior contém a falha de duplicação conhecida. Não executar Down, reabrir escritores antigos de saldo ou restaurar sobre o banco ativo. Os backups e comprovantes anteriores permanecem preservados; esta correção não exige um novo backup do banco.
