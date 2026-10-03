# Bar v0.1 — entrega incremental e limites

## Resultado

Módulo interno em longbeach-os, nas cinco camadas da solução atual. Nenhum outro sistema, repositório, banco de operação, autenticação, API, frontend ou deploy foi criado. Os documentos de requisitos foram localizados na raiz do projeto; /mnt/data não existe no computador atual. A conversa referenciada também foi consultada e seus anexos confirmados.

O diagnóstico está em auditoria-e-integracao.md. Configuração, recuperação de pagamentos e homologação estão em operacao-e-pagbank.md.

## Reuso

Entity, LongBeachDbContext, User/Role/Permission, JWT/refresh/login Google, bootstrap de autorização, AuditLog/AuditSaveChangesInterceptor, ProblemDetails, Serilog, cliente apiFetch, React Query, AuthGuard/AppShell, estilos de operações, PWA/Capacitor, health checks, PostgreSQL, Docker e CI/CD existentes.
O estoque JSON anterior permanece preservado. Ele não contém razão transacional e não foi convertido em saldo físico. Financeiro e Files/storage ainda são planejamento no checkout, portanto não foi criada integração fictícia com esses módulos.

## Entidades adicionadas

| Domínio | Entidades |
|---|---|
| Bar | BarProductCategory, BarProduct, BarSale, BarSaleItem, BarSaleDiscount |
| Inventory | StockLocation, StockBalance, StockMovement, InventoryCount, InventoryCountItem |
| Cash | CashRegister, CashSession, CashMovement, CashClosing |
| Purchases | Supplier, Purchase, PurchaseItem, PurchaseReceipt |
| Payments | BarPayment, StockReservation, PaymentProviderTransaction, PaymentWebhookInbox, PaymentReconciliation, BarEvent |

BarEvent é a fila durável de fatos para integração futura com Financeiro. Não há consumidor ou liquidação financeira implementada. Não criar uma segunda entidade AuditEntry: o AuditLog atual continua oficial.

## Migrations

BarCatalog → BarStock (inclui contagem física) → BarCash → BarSales (dinheiro/cartão) → BarPurchases → BarPixReconciliation → BarPaymentTendered → BarCatalogMetadataDiscounts → BarLedgerIntegrity → BarPermissions → BarPurchasesDetails.
Tabelas aditivas no contexto PostgreSQL existente. Locais Almoxarifado e Bar são os únicos dados operacionais semeados; nenhum produto, preço, operador fictício ou saldo inicial foi fabricado.
BarPurchasesDetails preserva custos unitários com seis casas decimais e faz backfill dos valores de compras anteriores. BarLedgerIntegrity bloqueia UPDATE/DELETE nos livros imutáveis. BarPermissions provisiona permissões/papéis do Bar mesmo com seed de startup desativado. Definições dos target models das migrations antigas foram congeladas para que novas entidades não alterem seu significado.

## Endpoints implementados

Prefixo /api/v1/bar:

- GET /catalog, /categories; POST /categories; GET/POST /products e PUT /products/{id}.
- GET/POST /stock/locations; GET /stock/balances, /stock/movements; POST /stock/transfers, /stock/losses, /stock/internal-consumption.
- GET/POST /counts; PUT /counts/{id}/items; POST /counts/{id}/approve e /cancel.
- GET/POST /cash/registers e /cash/sessions; POST /cash/sessions/{id}/supply, /withdraw, /expense, /close e /reopen.
- GET/POST /sales; POST /sales/{id}/payments/cash, /payments/card-manual, /payments/pix, /discount, /courtesy, /cancel e /refund.
- GET /sales/{id}/payments; POST /sales/{id}/payments/pix/refresh para recuperar pagamentos do próprio operador.
- GET/POST /suppliers, /purchases; POST /purchases/{id}/receive e /cancel (recebimento parcial e cancelamento do restante).
- GET /payments/config, /payments; POST /payments/{id}/refresh e /reconcile; GET /dashboard.
- POST /api/v1/integrations/pagbank/webhook: sem JWT de operador, mas com assinatura ECDSA obrigatória e consulta autenticada ao provedor.

Todos os demais endpoints do Bar usam identidade/permissões da aplicação. Custos não estão no catálogo público de operadores. Financeiro lê vendas e concilia sem ganhar permissão de operar PDV.

## Telas

/bar: PDV touch, produto indisponível desabilitado, quantidades/carrinho, dinheiro e cartão manual, troco, cortesia supervisionada, Pix condicional a configuração e consulta.
/bar/produtos: categorias, cadastro/edição, preço/custo, unidades/fator, mínimo, ativo/favorito e referência HTTPS da imagem.
/bar/estoque: locais, saldos/reservas, transferências e histórico.
/bar/inventario: primeira contagem e inventários, aprovação e cancelamento para recontagem.
/bar/caixa: caixa físico, abertura, fundo, suprimento, sangria, despesa, fechamento e reabertura.
/bar/vendas: próprias vendas ou todas conforme perfil, acompanhamento Pix recuperável, estorno total e retorno Todos/Alguns/Nenhum, impressão simples.
/bar/compras: fornecedores, compras com múltiplos itens, frete/desconto, recebimento parcial e cancelamento do restante.
/bar/perdas: motivo, consumo sem receita, aprovação acima do limite.
/bar/indicadores: receita, CMV histórico, lucro/margem, custo de cortesia, perdas e taxas separadas.
/bar/conciliacao: consulta PagBank e registro de taxa/líquido/referência.

## Validação e limites

66 testes de backend aprovados (43 de unidade e 23 de integração), 14 testes da interface aprovados e um teste PostgreSQL explicitamente ignorado. Build .NET e frontend/PWA, verificação TypeScript, testes de domínio, autorização com demo público, migrations/snapshot, assinatura ECDSA e contrato HTTP do gateway; testes da interface cobrem permissões, indisponibilidade e confirmação em dinheiro.
O teste PostgreSQL completo depende de LONG_BEACH_TEST_DATABASE_URL e fica explicitamente ignorado quando ausente. A CI existente possui PostgreSQL 17 e essa configuração. Não afirmar homologação de banco ou PagBank sem executar nesses ambientes.

## Pendências para aceite do MVP completo

- Executar e aceitar o fluxo de PostgreSQL/concorrência no CI e Staging; não há execução local do servidor PostgreSQL nesta entrega.
- Homologar a conta PagBank real no sandbox, formatos de assinatura/chave, timeout, confirmação após expiração e estorno. O adapter foi preparado, não ativado nem homologado com credenciais reais.
- Fornecer dados reais: catálogo, custos/preços, fornecedores, fatores, mínimos, contagem física, operadores/papéis, caixas/terminais, fundo, regras de aprovação, taxas/prazos.
- Files/storage ainda não existe em código: uploads, comprovantes de compra e fotos de perda dependem dessa implementação compartilhada. Imagens por referência HTTPS não substituem upload/varredura/auditoria de arquivos.
- Financeiro ainda precisa consumir/classificar os fatos de bar_events no domínio oficial. Não há contas, competência ou liquidação implementadas.
- Compras incluem múltiplos itens, recebimento parcial, frete/desconto, custo de aquisição, referência de pagamento e cancelamento do restante. Comprovantes anexos continuam pendentes de Files/storage. Alterações de pedido já emitido são feitas por cancelamento do restante e novo pedido, preservando o histórico.
- Descontos são autorizados pelo supervisor no rascunho em Vendas; o PDV permite salvar esse rascunho antes de receber.
- Inventário captura todos os produtos ativos do local; não há limite/recontagem automática por valor, filtros avançados ou paginação completa do histórico.
- Dashboard permite hoje/período e calcula receita, CMV/devoluções, taxas, compras e mais vendidos pelas datas dos eventos. Curvas horárias e desempenho por operador ainda não têm tela. Conciliação inicial é manual; não há importação bancária/EDI.
- Confirmar layout e equipamentos touch no ambiente real; impressão é simples pelo navegador, sem driver de impressora térmica.
- As alterações anteriores de operações, autenticação e deploy foram consolidadas no commit 1ca30a7, com autorização para publicar o conjunto. O Bar exige login; a interface de produção usa VITE_DEMO_MODE=false.

## Fora desta fase

Comandas, mesas, KDS/cozinha, pagamento dividido, ficha técnica completa/combos preparados, SmartPOS/PlugPag/Tap On, fidelidade, delivery/e-commerce, fiscal, terceiros e QuebraNunca permanecem ausentes.
