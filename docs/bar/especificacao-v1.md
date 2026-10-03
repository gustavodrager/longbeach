# Bar V1 — especificação funcional e técnica baseada no checkout

Decisão normativa: ../adr/ADR-004-bar-comandas-e-pagamentos-independentes.md. Evidência: auditoria-v1-2026-10-03.md. Nomes abaixo de entidades/rotas novas são propostas, não implementação existente.

## Regras fechadas
Visitante dispensa cadastro e documento para abrir conta. Provider pode exigir dados para uma cobrança específica; isso não transforma cadastro em pré-requisito de consumo. Cliente cadastrado pode ter vínculo opcional à identidade atual. Atendente e cliente lançam na mesma conta; registrar origem Attendant/SelfService, ator/acesso responsável, data, operação idempotente, preço e custo históricos. Catálogo manual tem código interno obrigatório, barcode/EAN e imagem opcionais, produtos preparados e fichas técnicas.

Conta não é caixa, consumo não é pagamento. Conta apresenta total líquido de consumos válidos, pagamentos aprovados alocados, reversões e saldo. Não fechar com saldo devedor nem cobranças indefinidas. Pagamento misto é múltiplo recebimento com alocação parcial; dinheiro com troco contabiliza o valor aplicado, não o entregue. Estorno financeiro não retorna estoque automaticamente: confirmar devolução física separadamente. Abertura/sangria/reforço/fechamento/divergência continuam em Cash.

## Modelo proposto e relacionamentos
| Objeto | Dados/relacionamentos | Estados ou invariantes |
|---|---|---|
| BarAccount | Id, referência, CustomerId opcional, local operacional, Version; 1:N consumos/alocações | Open → Closing → Closed; cancelamento só sem dívida/consumos ativos/cobranças pendentes; reabertura com motivo |
| Perfil cliente mínimo | Id; UserId opcional; referência futura Pessoas | Não duplicar User/senha; students JSON não vira cliente por inferência |
| AccountAccess | Conta, UserId opcional ou hash de credencial visitante, expiração/revogação | Escopo por objeto, acesso mínimo; QR não expõe token de operador |
| BarConsumption | Conta, produto, quantidade, origem, ator, snapshot preço/custo, receitaVersionId opcional, OperationId único | Registered → Fulfilled ou Reversed; reversão referencia original, não apaga |
| ConsumptionReversal | Consumo original, quantidade/valor/motivo/ator, OperationId | Limitar reversões ao original; ledger físico separado |
| PaymentAllocation | BarPayment, Conta, valor | Soma alocada ≤ valor aprovado; deduplicação e concorrência |
| PaymentReversal | Pagamento original/alocação, valor, motivo, referência provider/operação | Soma estornada ≤ aprovado; Pending/Confirmed/Failed com histórico |
| RecipeVersion/RecipeComponent | Produto preparado; N ingredientes BarProduct, unidade/fator, rendimento, vigência | Receita utilizada vira snapshot imutável; não alterar histórico |

Reutilizar Inventory.StockMovement/Balance/Location/Count, Purchases.Supplier/Purchase/Receipt e Cash.*. Uma baixa física referencia consumo (ou componentes preparados) uma única vez; receita não deve baixar simultaneamente produto acabado e ingredientes sem regra explícita de produção. Para V1, proposta: preparado baixa ingredientes na confirmação de atendimento; produto revendido baixa o próprio item. Validar disponibilidade e manter transação atômica; estorno e perdas não podem produzir saldo fictício.

BarPayment hoje aponta SaleId obrigatório. Plano de compatibilidade: primeiro mapear e testar todas as consultas/índices; adicionar vínculo/alocação sem migrar automaticamente vendas, com caminho legado preservado. Só depois habilitar pagamentos por conta e relaxar campos/cardinalidade com backfill explícito validado. Vendas antigas continuam com seus snapshots e recebimentos originais. Nenhuma alteração de esquema está executada por este documento.

## Migrações propostas
1. BarAccountsFoundation: contas, acesso e perfil cliente mínimo se o domínio Pessoas seguir ausente; FK User opcional, índices de referência/operação e Version concorrente.
2. BarConsumptions: consumo, origem/ator/snapshots, reversões imutáveis, FK produto e conta; restrições de quantidade/valor e índices de operação.
3. BarAccountPayments: alocações/reversões; adaptação coordenada de SaleId e queries Single, preservação do caminho legado e testes de reconciliação. Não editar BarSales já existente.
4. BarRecipes: versões/componentes, conversão/rendimento e snapshots de consumo; movimentos por componente.

Cada etapa deve validar pending model changes, aplicação desde banco vazio e upgrade de baseline preenchida, triggers, FKs, concorrência e reconciliação. Migrations hospedadas por job único; rollback de aplicação preserva tabelas/histórico. Não executar Down destrutivo para desfazer operação real.

## API proposta no mesmo /api/v1/bar
- POST/GET /accounts; GET /accounts/{id}; POST /accounts/{id}/close e /reopen.
- POST /accounts/{id}/consumptions; POST /consumptions/{id}/fulfill e /reverse.
- POST /accounts/{id}/payments: valor/método/OperationId e sessão física somente quando aplicável; GET /accounts/{id}/payments.
- POST /payments/{id}/reversals: valor e motivo; consulta do estado remoto/local sem dupla confirmação.
- GET /self-service/catalog; GET /self-service/account; POST /self-service/consumptions e /payments usando acesso restrito à conta.
- POST /accounts/{id}/accesses; POST /accounts/{id}/accesses/{accessId}/revoke.
- GET/POST /products/{id}/recipes; publicar versão validada, sem sobrescrever ficha já usada.

Reutilizar middleware/ProblemDetails; versões concorrentes e chaves de operação no contrato. Resposta de repetição idempotente retorna resultado original; mesma chave com payload divergente falha. Não aceitar AccountId arbitrário com credencial de outra conta. Toda ação usa permissão e validação do objeto. Permissões propostas: bar:accounts:read/open/close, bar:consumptions:write/reverse, bar:recipes:manage e self-service limitado ao próprio objeto; provisionar no catálogo/migration atuais. Gerente autoriza reversões/divergências; operador não lê custo; cliente não recebe permissões de operação interna.

## Telas propostas
Preservar /bar/produtos, estoque, inventário, caixa, compras, indicadores e conciliação. Adicionar /bar/contas (abertas/busca/nova conta visitante ou cliente), /bar/contas/:id (itens/origem/atores/saldo/recebimentos), pagamento parcial/misto e reversões supervisionadas. Produtos recebe editor de ficha técnica. PWA cliente recebe catálogo, leitura QR/barcode, minha conta, consumo e pagamento; custo/CMV e controles administrativos ficam fora da projeção cliente.

## Critérios de aceite críticos
Dois atendentes e cliente lançam na mesma conta sem perda de atualização; visitante abre sem cadastro; cliente não acessa conta alheia; parcial/misto não duplica baixa; corrida de recebimentos não excede saldo; retry não cobra duas vezes; estorno não repõe estoque sem ação física; histórico continua conciliável; saldo/CMV não mudam por edição retroativa; receita baixa ingredientes corretamente; falha provider após cobrança é recuperável; caixa registra apenas dinheiro recebido; sem dependência de hardware/IA.
