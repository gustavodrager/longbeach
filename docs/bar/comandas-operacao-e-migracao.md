# Comandas, consumo, pagamentos e caixa

Implementação adicional ao bar legado, conforme ADR-004. As tabelas de vendas e pagamentos históricos permanecem preservadas. O novo atendimento utiliza `/api/v1/bar/tabs`; autoatendimento utiliza `/api/v1/bar/client`, com credencial opaca no cabeçalho `X-LongBeach-Tab`. O QR da interface guarda essa credencial no fragmento do endereço, para evitar transmiti-la na URL HTTP. Não registrar esse cabeçalho em logs, proxies ou ferramentas de monitoramento.

## Fatos independentes

- Uma solicitação do cliente aguarda aceitação e não compõe o valor cobrável nem reserva estoque. A aceitação registra consumo e reserva disponibilidade. A entrega libera a reserva e registra uma única baixa física, com origem no item. Recebimento posterior não baixa estoque novamente.
- Produtos marcados como preparados aguardam entrega, mesmo quando o atendente pede o atalho de registro e entrega. Receitas são versões imutáveis com rendimento e ingredientes, cadastradas em `/bar/receitas`. A conversão entre unidade de compra e estoque fica congelada na versão. A aceitação guarda a receita, quantidade e custo dos ingredientes; entrega e eventual devolução usam esse snapshot. Quantidades de insumos têm precisão de 0,001 e arredondamento para cima. Preparados sem receita mantêm explicitamente o controle do próprio produto cadastrado, para preservar a compatibilidade. Novas receitas não reinterpretam consumos anteriores.
- Produtos com preço de venda zero são insumos ou produtos sem venda. Permanecem disponíveis na gestão, estoque e receitas, mas ficam fora do catálogo de atendimento/cliente. Lançamento direto pela API também é recusado; cortesias continuam exigindo ajuste autorizado pela supervisão.
- Pagamentos alocam valores parciais independentes. Pix pendente reserva financeiramente sua parcela, mas não aparece como recebimento confirmado. Dinheiro entra somente no caixa aberto do operador que recebeu; cartão exige confirmação da aprovação na maquininha e não movimenta o dinheiro físico.
- Descontos e cortesias exigem supervisão e motivo. Preservam o consumo bruto e registram ajuste no histórico. Valores já recebidos ou reservados em Pix não podem ser abatidos novamente. Correções de consumo confirmado e retorno físico são ações explícitas da supervisão.
- Uma comanda só fecha sem saldo, Pix pendente, pedido solicitado/aceito ou estorno pendente. Fechar revoga o acesso do cliente. Estornar uma comanda fechada reabre o saldo e mantém o acesso antigo revogado.
- Taxas conciliadas são registradas com referência e permissão `bar:payments:reconcile`; a ausência de conciliação retorna `available: false`, não uma taxa estimada.

## Repetição e conexão

Operações usam UUID obrigatório nas novas rotas e fingerprint irreversível. Repetir a mesma operação e conteúdo devolve a resposta já gravada; reutilizar a chave para outro conteúdo é recusado. Os comandos transacionais usam isolamento serializável e bloqueio por chave/comanda. Um conflito concorrente retorna conflito para repetir a mesma operação, sem trocar a chave.

Abertura e fechamento de caixa aceitam `operationId` opcional para compatibilidade com clientes antigos. Os novos clientes devem sempre enviá-lo. Sem a chave, a compatibilidade antiga não permite recuperar a resposta original após perda da conexão. Movimentos já exigem a chave. Há um único caixa aberto por pessoa e por registro físico.

Pix e estorno Pix exigem o provedor real configurado. Primeiro registra-se a intenção pendente; chamadas externas reutilizam a chave de idempotência. Aprovação depende de consulta validada ao provedor, incluindo identificação, referência, moeda e valor. Expiração local, captura da tela ou recibo apresentado pelo cliente não aprovam o pagamento. Webhooks verificados e reconciliação periódica recuperam estados pendentes. Se a criação do Pix perde a resposta antes de registrar o vínculo, repetir a operação original com os dados do pagador informa a mesma parcela, sem criar outra alocação. Dados pessoais do pagador não ficam armazenados na comanda ou auditoria.

Falhas de confirmação externa após gravar a intenção retornam `502` com `paymentId` e `operationId`, mantendo a parcela pendente. `400/422` indicam rejeição de entrada, antes de confirmar uma nova intenção. A resposta `canResume` distingue uma criação interrompida de um Pix normalmente aguardando o provedor, sem expor seu identificador ao cliente. Após perda de resposta, a interface conserva o pedido e a chave, impede alterar o envio incerto e permite repetir a mesma confirmação. O resultado continua sujeito à leitura dos registros confirmados.

Estorno em dinheiro usa exclusivamente o caixa original; se ele estiver fechado, a supervisão precisa reabri-lo antes da devolução registrada. A tentativa recusada não deixa uma intenção de estorno persistida. Estornos em cartão são registros da aprovação manual feita fora do sistema; não representam cancelamento automático na maquininha.

## Migração e implantação

A migração `20261004110000_BarTabs` acrescenta tabelas, sequência de numeração, marcação de produtos preparados e índice de caixa individual. Não importa nem converte vendas históricas em comandas. Mantém registros históricos imutáveis e acrescenta proteção ao snapshot do consumo.

A migração posterior `20261004120000_BarRecipes` acrescenta versões, ingredientes e snapshots por consumo. Não fabrica receitas nem recalcula o estoque de entregas anteriores. Ambas devem acompanhar a API que lê essas tabelas e ser aplicadas pelo mesmo job controlado.

Antes de aplicá-la, procurar pessoas com vários caixas abertos/reabertos:

```sql
SELECT "OpenedBy", COUNT(*)
FROM cash_sessions
WHERE "State" IN ('Open', 'Reopened')
GROUP BY "OpenedBy"
HAVING COUNT(*) > 1;
```

Se houver linhas, reconciliar fisicamente e fechar explicitamente os caixas excedentes com responsáveis e motivos. A migração aborta com mensagem clara sem fechar caixas automaticamente. Executá-la uma única vez pelo job controlado do ambiente, conforme as regras do repositório. Produção exige aprovação do ambiente e artefato identificado. Para voltar à interface anterior, manter a rota de bar legado; não remover tabelas de comandas que receberam dados operacionais.

## Consultas administrativas

Indicadores usam consultas SQL específicas por métrica, agregados e paginação sob snapshot de leitura. Totais e páginas usam os mesmos filtros. Consumo bruto, recebimentos brutos, estornos e taxas permanecem distintos; dinheiro físico atual inclui fundo e movimentos do caixa. A origem abre a comanda, pagamento específico, caixa com fechamento/movimentos ou produto com seu histórico de estoque. Valores monetários na API são reais em decimal, com duas casas; quantidades seguem a unidade do produto, com até três casas.

## Validação humana

A implementação não equivale à aprovação pelos cinco atendentes. O roteiro e os critérios continuam em `prototipo-ux-validacao.md`. Resultados com participantes ainda não foram coletados. Antes de promover o atendimento para uso operacional, executar os cenários com contas individuais, produtos e ambiente de teste próprios, incluindo tentativa de duplicação, interrupção de conexão e acesso a outra comanda/caixa.
