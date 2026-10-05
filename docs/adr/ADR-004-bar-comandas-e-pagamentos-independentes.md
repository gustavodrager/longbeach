# ADR-004 — Bar interno, comandas e pagamentos independentes

Data: 03/10/2026. Status: Accepted. Autoridade: decisões explícitas do responsável pelo projeto nesta solicitação.

## Contexto
O Long Beach OS é standalone (.NET/React/PostgreSQL próprios) e monólito modular. A base real já implementa Bar como PDV de venda imediata. A exclusão antiga de Bar/PDV/estoque/PagBank da primeira fase e as exclusões de comandas, pagamento dividido e receitas nos documentos Bar v0.1 estão superadas para o escopo funcional V1. Os documentos anteriores permanecem como histórico da entrega, não como limites vigentes.

## Decisão
Bar é um bounded context interno, nas camadas Domain/Application/Infrastructure/Contracts/Api e no app existente. Não criar sistema, repositório, API, frontend, banco ou autenticação separados. Preservar ADR-001 e ADR-003: independência em relação a outros produtos e isolamento dos ambientes.

Cliente cadastrado é opcional; visitante pode abrir comanda. Conta, consumo, pagamento e caixa têm ciclos independentes. Atendente e autoatendimento podem lançar na mesma conta, com autoria e origem por consumo. Pagamentos físicos e móveis, parciais e mistos fazem parte da V1. Pagamentos aprovados alocam valor à conta; dinheiro movimenta a sessão física efetivamente utilizada. Pix não vira dinheiro em caixa.

Reutilizar BarProduct, Inventory, Cash, Purchases, Payments, IPaymentGateway, Identity, AuditLog e LongBeachDbContext. Receitas versionadas compõem produtos preparados; estoque usa ledger e projeções. Não apagar operações financeiras/estoque: produzir reversões auditadas. QR/código de barras/PWA são V1; NFC/RFID/sensores/visão computacional são evolução opcional.

## Consequências
BarSale não é comanda: hoje exige CashSession e um pagamento único por SaleId. Não renomear entidades nem remover índices para simular pagamentos parciais. Introduzir conta/consumo e alocação de pagamentos de forma aditiva, mantendo vendas existentes legíveis. Reavaliar os serviços que usam Single por SaleId antes de ampliar cardinalidade. Migração de dados históricos exige reconciliação explícita, sem saldos/clientes fabricados.

Aceite arquitetural não comprova prontidão operacional. Homologar PostgreSQL, concorrência, autorização por objeto e reconciliação de providers antes de liberar fluxos reais. Nenhum deploy é autorizado por este ADR.

## Implementação de fichas técnicas na V1

Cada publicação cria uma versão imutável da receita, com rendimento, ingredientes e conversão da unidade de compra para a unidade de estoque congelada. O pedido solicitado por QR não reserva insumos. A aceitação seleciona a versão vigente e grava snapshots das quantidades efetivas e dos custos dos ingredientes; reserva, entrega e reversão usam esses snapshots. Pagamento não repete a baixa. Quantidades de estoque têm precisão de 0,001 e são arredondadas para cima ao calcular a necessidade, evitando subtrair menos que a fórmula. A ficha aceita continua acessível mesmo depois de outra publicação.

A composição é de um nível: ingredientes são produtos ativos de estoque, sem preparação e sem autorreferência. A gestão das versões exige `bar:catalog:write`. Ingredientes e custos não são publicados ao atendente ou ao cliente. Produtos preparados sem receita e consumos previamente aceitos sem versão mantêm a política explícita de estoque do próprio produto; a migração não reinterpreta o histórico. Novas vendas de produtos com ficha técnica passam pelo atendimento de comandas, impedindo que a venda imediata anterior ignore seus insumos.

A migração aditiva `20261004120000_BarRecipes` preserva a migração de comandas e o estoque histórico, acrescenta receitas e snapshots, e protege os registros contra edição ou exclusão. Alterar a unidade-base de um ingrediente vinculado é recusado; use outro cadastro para não reinterpretar quantidades históricas.
