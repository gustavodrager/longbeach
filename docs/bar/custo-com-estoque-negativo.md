# Custo de reposição quando o estoque está negativo

## Defeito e correção

A venda pode deixar o estoque negativo. A fórmula anterior de `BarProduct.ReceiveCost` incluía esse déficit como quantidade valorizada na média ponderada. Um recebimento podia, então, produzir custo médio negativo, distorcido ou uma divisão por zero.

Exemplo reproduzido: saldo de −10 unidades, custo anterior de R$ 6 e recebimento de 15 unidades a R$ 2 produziam custo médio de −R$ 6. O catálogo conseguia persistir esse valor, mas `CK_bar_tab_items` exige `UnitCost >= 0` e recusa o consumo que o copia. Essa constraint foi criada por SQL na migration `20261004110000_BarTabs`, além do modelo EF.

O cálculo passa a considerar somente a quantidade anterior positiva:

- Sem saldo positivo, o custo médio passa a ser o custo unitário do recebimento.
- Com saldo positivo, a média ponderada é mantida, com seis casas decimais.
- O custo anterior, quando participa da média, e o resultado são validados antes de alterar custo ou versão.
- Quantidade e custo inválidos recusam o recebimento sem modificar o produto.

Isso preserva a venda com estoque negativo e não reescreve os custos congelados nos consumos ou movimentos históricos. Não há migration nem substituição silenciosa de custo por zero.

## Cadastros que já tenham custo inválido

Esta correção previne novos cálculos incorretos; não repara automaticamente valores já persistidos. A relação com o incidente informado do Sprite precisa ser confirmada pelos dados e logs de produção.

1. Correlacionar a comanda e a operação com o log `Direct sale remains unconfirmed`. Conferir `SqlState`, `ConstraintName` e a referência da requisição, sem repetir uma venda apenas para diagnóstico.
2. Consultar o produto exato, `AverageCost`, `LastCost`, versão e recebimentos em modo somente leitura. `23514` com `CK_bar_tab_items` e custo médio negativo confirma essa cadeia de falha.
3. Determinar o custo correto pelo histórico de compras/recebimentos. `LastCost` é evidência; não deve ser copiado automaticamente sem reconciliação.
4. Corrigir somente `AverageCost` pelo fluxo de catálogo existente, preservando os demais campos e usando a versão atual. O interceptor de auditoria registra antes/depois, operador e correlação.
5. Conferir a alteração e retomar o registro original pelo mesmo identificador de operação. Não apagar a fila nem criar uma venda substituta para ocultar a pendência.

## Validação de regressão

`BarProductCostTests` cobre reposição parcial, exata e superior ao déficit; recebimentos sucessivos; preservação da média com estoque positivo; inputs inválidos; e custo anterior inválido que seria ocultado por uma média final positiva.

`BarTabsProductCostPostgresTests` cobre venda que gera saldo negativo, recebimento de compra, nova venda direta e repetição idempotente. Confere um único consumo, custo válido, saldo e uma única movimentação de estoque.

## Apresentação da venda direta

O resumo lateral usa uma linha por informação, evitando herdar quatro colunas do resumo de página inteira. Rótulos e valores permanecem legíveis em painéis estreitos. Preço e controles dos produtos se reorganizam pela largura do cartão, mantendo os botões de 44 px contidos. As regras de fila, confirmação e recebimento permanecem as mesmas.
