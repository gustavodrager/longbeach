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


## Identificação na abertura — incremento local de 11/10/2026

Em Atendimento → Comandas → Abrir comanda, o atendente escolhe visitante sem cadastro ou cliente cadastrado. A busca consulta apenas contas ativas que já entraram com Google: pelo menos três caracteres do nome ou e-mail completo exato. Retorna até vinte resultados com nome e e-mail mascarado, sem papéis, telefone, CPF ou informações financeiras. A rota `/api/v1/bar/tabs/customers` exige `bar:sales:operate`; o cliente não pode consultar esse diretório.

O atendente confirma explicitamente quem terá acesso ao consumo e aos pagamentos. O nome opcional identifica a pessoa ou um grupo; não cria nem vincula um grupo mensalista. Em comandas coletivas, somente o responsável selecionado recebe o vínculo na área pessoal. Não existe rateio por participante neste incremento. O consumo do bar permanece independente das mensalidades da quadra.

`OpenTabInput.ResponsibleUserId` é opcional, preservando visitantes e venda imediata. Quando informado, é válido apenas no modo `Tab`. A API valida a conta ativa com Google e grava `BarTab`, `BillingAccount` e histórico `ResponsibleAssigned` na mesma transação serializável/idempotente. Uma falha não deixa comanda órfã; repetir a operação retorna a mesma abertura. O vínculo usa o modelo financeiro existente, sem migration e sem conceder acesso geral ao Financeiro ao atendente. As alterações passam pelo interceptor de auditoria existente. O retorno ao cliente via QR não expõe a identidade do responsável.

O nome da comanda respeita o limite existente de 80 caracteres. Quando o nome do cliente é usado como identificação inicial, ele é abreviado nesse limite; o cadastro e o nome do responsável permanecem completos. A lista e o detalhe exibem o responsável consultando o vínculo atual; essa informação não é uma fotografia histórica do nome.

O formulário preserva a operação de abertura incerta, inclusive depois de recarregar a mesma aba, em armazenamento de sessão separado por operador. Enquanto o resultado for incerto, permite repetir os mesmos dados e bloqueia uma nova escolha. Não guarda credenciais, e-mail ou dados de pagamento. O estado é removido após confirmação ou rejeição de entrada. Se o navegador impedir esse armazenamento, a proteção permanece em memória apenas enquanto a página estiver aberta.

Validação local: testes de interface para confirmação, escolha de responsável e recuperação após remontagem; testes PostgreSQL para vínculo único, acesso exclusivo à conta, visitante sem vínculo, contas inválidas/inativas, mascaramento e nomes longos. A homologação no navegador criou uma comanda vazia identificada como teste, conferiu o vínculo na área pessoal, navegação por teclado e largura de 390 px sem rolagem horizontal. Nenhum produto ou pagamento foi lançado nessa comanda. Builds da API e frontend/PWA conferidos. PagBank permanece desligado na homologação.

Resultado da rodada: 269 testes de frontend em 31 arquivos e 48 testes de integração de comandas/contas/autorização aprovados, sem testes ignorados. Os dois testes novos de vínculo foram repetidos após o ajuste de nomes longos e passaram. A suíte de interface teve dois cenários antigos de solicitação estabilizados com uma data fixa de teste, sem alterar a regra operacional de datas. A auditoria local confirmou uma inclusão de comanda e uma de conta vinculada.

Este incremento não foi publicado. Comandas antigas sem responsável não são associadas automaticamente; o vínculo administrativo existente continua sujeito à conferência da gestão. Para publicar, promover a API antes da interface; não é necessária alteração de banco. A interface anterior pode continuar sendo usada com a API nova, preservando os vínculos já gravados.

## Pendências e consulta de encerradas — segundo incremento local de 11/10/2026

A lista oferece Abertas, Com pedidos, Encerradas e Todas. Situação, busca e página ficam na URL e são preservadas ao abrir uma comanda e voltar. Os filtros são aplicados no servidor antes da paginação. Encerradas aparecem pelo encerramento mais recente; Com pedidos e a fila de pedidos ordenam as comandas pelo pedido pendente mais antigo, com desempate pelo número. Essa ordenação é por comanda, não uma fila única de itens individuais.

Cartões e detalhes distinguem aceite, entrega, pagamento e estorno pendentes. A contagem de aceite/entrega representa linhas de consumo, não unidades de produto. Após 24 horas corridas, comandas abertas recebem aviso de conferência, sem fechamento, multa ou alteração automática. O relógio visual se atualiza a cada minuto. Pedidos mostram espera desde a solicitação; entregas, desde o aceite, com fallback para a solicitação em registros antigos sem essa data.

Comandas encerradas mostram a data do encerramento e o total da comanda, preservando consumo, pagamentos e comprovantes para consulta. Adicionar produtos, receber e fechar não são oferecidos nesse estado. Permissões e ações de supervisão continuam sendo determinadas pelas regras existentes. Falhas de consulta não são apresentadas como lista vazia. No celular, os cartões ocupam uma coluna para acomodar os avisos e a identificação.

Validação desta rodada: 52 testes da interface do atendimento e 17 testes PostgreSQL de comandas aprovados, sem ignorados; compilação de tipos, API e frontend/PWA conferida. Cobertura inclui corte exato de 24 horas, datas inválidas/futuras, filtros e ordenação antes da paginação, retorno com busca/página e consulta de encerradas. No navegador conectado à API local, conferidos histórico, detalhe, retorno, fila, seleção por teclado e largura de 390 px sem rolagem horizontal. A conferência utilizou registros já existentes de homologação, sem novos consumos ou pagamentos.

O incremento permanece local e não exige migração. PagBank continua desligado. Publicação depende de aprovação e deve levar a API atualizada antes da interface.

## Identificação durante a venda — terceiro incremento local de 11/10/2026

A escolha e a revisão dos produtos exibem número, nome da comanda, responsável vinculado e saldo atual, separado do valor do pedido em edição. Ausência de vínculo é explícita; o nome de um grupo não implica responsável cadastrado. A venda avulsa informa que abrirá uma comanda independente sem responsável vinculado. Os textos de confirmação refletem o contrato existente: o lançamento do atendente já aceita o consumo; itens não entregues seguem para a fila.

Escolher ou trocar a comanda abre a lista de abertas. Cada atendimento conserva seu próprio carrinho por operador; produtos não são transferidos entre comandas nem da venda avulsa. A etapa de revisão é reiniciada quando muda o destino. Enquanto um envio aguarda confirmação, o atalho de troca fica oculto e a recuperação idempotente existente é preservada. Comanda encerrada ou falha de consulta, inclusive com resposta anterior em cache, impede novos envios e mantém o rascunho.

Validação: 57 testes de interface aprovados, incluindo identidade nas duas etapas, destino exato do envio, visitante sem vínculo, isolamento de rascunhos, comanda encerrada e falha após consulta anterior. Tipos, frontend/PWA e API compilados. No navegador local, conferidos desktop, largura de 390 px sem rolagem lateral e confirmação por teclado. A comanda identificada como teste recebeu uma unidade de Água · homologação (R$ 5,00). O banco confirmou uma única linha aceita, eventos Requested/Accepted únicos e nenhum pagamento; o carrinho foi limpo após o sucesso. Esse registro permanece apenas na base local de demonstração.

Não há alteração de contrato, banco ou regras comerciais neste incremento. Não publicado; PagBank permanece para etapa posterior.
