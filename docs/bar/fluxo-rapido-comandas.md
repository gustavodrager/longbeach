# Fluxo rápido de comandas — pacote 1

Implementação local em 16/11/2026. Sem publicação em produção.

- A lista de comandas oferece **Adicionar produtos** e **Receber**, conforme os acessos do operador.
- O catálogo mantém o pedido e total visíveis. O operador lança diretamente, sem uma tela obrigatória de conferência. Produto pronto pode ser lançado e entregue; os demais continuam em Pedidos. O rascunho não movimenta estoque.
- O recebimento começa com o saldo disponível. Parte e divisão continuam opcionais.
- Na maquininha, selecionar o meio não registra pagamento. O botão **Aprovado na maquininha — receber R$ X** declara a aprovação externa e registra o recebimento. O tablet não consulta a Moderninha.
- Dinheiro aceita o valor exato sem digitação. Para troco, o operador informa quanto recebeu; permanecem as validações de caixa próprio, aberto e saldo para troco.
- Após pagamento parcial, permanece em Receber com saldo atualizado. Após quitação, volta à lista, com comprovante opcional.
- Qualquer pagamento aprovado pode encerrar automaticamente a comanda, quando o saldo devido e os pagamentos pendentes forem zero e não houver pedidos ou estornos pendentes.
- Uma comanda quitada com item Requested/Accepted permanece Open e é apresentada como **Paga — aguardando entrega**. A última entrega encerra automaticamente; aceitar pedido novo que aumente o saldo exige receber a diferença. O estado exibido é derivado, sem migration adicional.
- Entrega segue como o único momento da baixa de estoque. Encerramento não fecha o caixa do operador.
- Repetição da mesma operação preserva pagamento/entrega e histórico únicos. Confirmação indeterminada mantém a recuperação do pedido ou recebimento original.
- Comandas históricas sem nova operação não são encerradas em lote. O fechamento manual existente permanece disponível para casos como comanda vazia ou cortesia integral.

## Validação

Testes de interface cobrem atalhos, lançamento direto, declaração de aprovação, dinheiro exato/troco, divisão e pagamento parcial, retorno à lista, comprovante opcional, entrega pendente, permissões, cancelamento e retomada após perda de resposta. Testes em PostgreSQL descartável cobrem as quatro formas manuais, pagamento misto, estoque e histórico únicos, preparados pagos com múltiplas entregas, confirmação online e falhas de integração. API e frontend devem compilar antes da entrega.

Resultado local: **212 testes de interface e 39 testes de comanda em PostgreSQL aprovados**, sem testes ignorados nesse conjunto; compilação da API e do frontend aprovada. O banco descartável foi removido após os testes. A conferência visual no tablet físico ainda não foi realizada.

A homologação real do Checkout PagBank continua dependente da liberação do suporte; este pacote não altera essa ativação.
