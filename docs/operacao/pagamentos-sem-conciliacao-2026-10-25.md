# Consulta de pagamentos sem conciliação manual

Decisão do proprietário em 25/10/2026: retirar a conciliação PagBank e facilitar a consulta dos pagamentos. Implementação preparada a partir da release financeira Google `ee33a37` e da documentação `43b7def`. A publicação desta alteração é uma promoção separada.

## Fluxo de consulta

Recebimentos reúne busca por conta ou responsável, filtros de situação e Bar/Quadra e valores da seleção. Os detalhes de cada conta mantêm pagamentos, estornos, origem e comprovantes. Contas e lançamentos sem responsável financeiro vinculado também aparecem na gestão, com acesso ao registro original.

As telas de vínculo manual entre liquidação EDI e pagamento e de cadastro manual de taxas deixam de existir. Os endereços antigos `/recebimentos/conciliacao`, `/recebimentos/conciliacao-bar` e `/bar/conciliacao` redirecionam para `/recebimentos`. O detalhe do pagamento conserva as taxas históricas como informação de leitura.

Os endpoints manuais de settlements e reconcile são retirados. A permissão de conciliação sai do catálogo ativo. Consultas de pagamentos e atualização de situação continuam protegidas pelas permissões financeiras; cobrança e estorno conservam suas permissões próprias.

## Valores e origem

- Recebido registrado usa o valor pago da origem, após os estornos confirmados e antes das taxas. Não representa saldo disponível na conta bancária.
- Em confirmação conserva somente tentativas de pagamento ainda pendentes. Esses valores não são adicionados ao recebido nem ao saldo disponível para um novo pagamento.
- Saldo a receber usa o valor ainda disponível para pagamento na conta de origem.
- Estorno em confirmação permanece no recebido até a confirmação efetiva da devolução.
- Taxa ausente continua indisponível; não é estimada como zero.

A consulta administrativa conserva as contas vinculadas e acrescenta comandas do Bar e lançamentos elegíveis da Quadra sem vínculo. O par tipo/origem impede reapresentar uma conta vinculada como outra conta sem vínculo. A leitura ocorre no mesmo snapshot para manter essa seleção consistente durante a criação de um vínculo.

As projeções sem vínculo usam `isLinked=false` e não criam contas, pagamentos, baixas ou auditorias de escrita. Comandas reutilizam o cálculo original de consumo, descontos, pagamentos e estornos. Lançamentos elegíveis da Quadra usam a situação informada no lançamento; um lançamento pago sem transação vinculada é identificado como pagamento informado pela equipe. Não é fabricado um identificador de transação bancária para esse caso.

As projeções abrem a comanda ou o lançamento original. Ações que dependem de uma conta de cobrança vinculada permanecem disponíveis somente nas contas vinculadas. A área do cliente conserva o filtro de suas próprias contas; não recebe projeções administrativas.

A lista administrativa atualiza a cada minuto. A leitura do Bar carrega comandas, itens, pagamentos e estornos pendentes em quatro consultas em lote, reutilizando o cálculo original; não consulta o provedor nem carrega histórico de ações por comanda. Contas vinculadas da Quadra conservam seu carregamento individual. A lista ainda retorna o histórico completo, sem truncamento silencioso.

Documentos EDI, resumos PagVendas e extratos continuam preservados como fontes de consulta. Não são somados outra vez aos pagamentos da operação. Lançamentos gerais que não representam contas elegíveis da Quadra e vendas do fluxo antigo permanecem em suas consultas de origem; o resumo de recebimentos não é um consolidado de toda movimentação bancária ou de despesas.

## Preservação e publicação

Históricos de vínculos e taxas anteriores, documentos bancários, pagamentos e estornos permanecem guardados. Não há exclusão de tabelas nem nova migration para esta alteração. As rotinas automáticas de confirmação e os bloqueios de repetição, valor, moeda, vínculo e operação pendente continuam ativos.

Antes de promover, conferir os testes da interface, as rotas manuais removidas, os fluxos automáticos de pagamento/estorno e a leitura administrativa em PostgreSQL sintético. Conferir a tela em desktop e celular com dados fictícios. A promoção deve identificar o commit e os artefatos aprovados do Google; não reaplicar migrations ou dados de homologação.

O chamado PagBank sobre os estornos de Sandbox e a liberação oficial da integração permanecem processos independentes desta simplificação da consulta.

## Verificação local

A interface passou em 495 testes e no build TypeScript/Vite. A prévia no navegador usou somente dados fictícios e consultas em memória, com operações financeiras e conexões externas bloqueadas. Foram conferidos busca sem acentos, filtros combinados, totais, detalhamento de comanda sem vínculo, ausência de ações inválidas, layout em desktop/celular e falha de consulta sem exibir totais antigos como atuais. Esse ensaio visual não é uma validação da API publicada ou do PagBank.

Os testes PostgreSQL verificam leitura sem gravações, fontes sem vínculo, isolamento entre usuários, ausência de duplicidade durante vínculo concorrente e quantidade constante de consultas para comandas do Bar com vários pagamentos. As rotas de conciliação removidas retornam 404 inclusive para a gestão. Os fluxos automáticos de confirmação e estorno continuam cobertos pelos testes de integração.
