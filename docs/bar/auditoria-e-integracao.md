# Bar v0.1 — auditoria e desenho de integração

Data: 03/10/2026. Auditoria estática do checkout existente; não comprova estado de produção.
Fontes lidas integralmente: `../../../HANDOFF_Nova_Conversa_Modulo_Bar_LongBeach.md` e
`../../../LongBeach_OS_Modulo_Bar_v0.1.md`. A ordem do handoff prevalece; terminal integrado permanece fora desta fase.

## Diagnóstico

| Área | Evidência atual | Decisão |
|---|---|---|
| Backend | .NET 10; LongBeach.sln; Domain/Application/Infrastructure/Contracts/Api | Mesma solução e API; novos domínios internos |
| Frontend | app/ React 19, TypeScript, Vite, React Router, React Query; PWA/Capacitor | Mesma navegação, shell, estilos e cliente HTTP |
| Persistência | LongBeachDbContext, EF Core 10/Npgsql, PostgreSQL; InitialCreate e OperationalRecords | Tabelas aditivas no contexto existente; nenhum banco novo |
| Identidade | User, Role, Permission, UserRole, RolePermission, RefreshToken; JWT, refresh rotativo, cookie/CSRF, login Google opcional | Mesmos usuários e políticas por claim de permissão |
| Auditoria | AuditLog e AuditSaveChangesInterceptor; ator, data, correlação; omite segredos | Reutilizar em todas as gravações do Bar |
| Módulos reais | Identity e registros JSON de alunos, equipe, inventory e projects | Preservar registros existentes; não tratar JSON como razão transacional |
| Rotas atuais | /api/v1/auth e /api/v1/operations/{kind}; /, /alunos, /equipe, /estoque, /projetos, /conta | Novas rotas internas /api/v1/bar e /bar/* |
| Componentes | AppShell, Logo, AuthGuard, AuthProvider, apiFetch, formulários e estilos de operações | Reutilizar estrutura; Bar sem fallback local para operações reais |
| Estoque | OperationalRecord(kind=inventory) e formulário genérico com quantidade editável | Não é equivalente a StockBalance/StockMovement; não inferir saldo inicial |
| Financeiro | Permissões finance:* e documentos; sem contas/lançamentos transacionais implementados | Eventos duráveis do Bar para integração futura; não inventar liquidação |
| Fornecedores/pagamentos | Não encontrados em código | Criar no domínio compartilhável Purchases/Payments, não dentro de catálogo externo |
| Arquivos/storage | Planejados nos C4/modelo; nenhum FileObject ou adapter implementado | Não criar bucket paralelo; upload de imagens/comprovantes depende do módulo Files |
| Tarefas | Itens dentro do JSON de projects | Preservar; não duplicar com o Bar |
| Integrações | Google sign-in; nenhuma gateway de pagamento existente | IPaymentGateway + adapter PagBank isolado na Infrastructure |
| Observabilidade | Serilog, ProblemDetails, /health/live e /health/ready PostgreSQL | Reutilizar; jamais registrar token ou dados de cartão |
| CI/CD | GitHub CI: build/test .NET e React, PostgreSQL 17; release-images com environments/OCI identificada | Estender testes no pipeline existente |
| Deploy | Dockerfiles, compose, Railway IaC; migrate-only em preDeploy; domínio oficial API e preview web | Mesmos serviços; nenhuma publicação nesta execução |

## Riscos encontrados na base

- Checkout com alterações anteriores e arquivos ainda não versionados; preservar sem incluir trabalho alheio nos commits do Bar.
- DemoMode permite escrita anônima apenas nos registros operacionais. Nunca aplicar AllowAnonymous ao Bar.
- Railway está configurado com VITE_DEMO_MODE=true e Authorization:SeedOnStartup=false: o Bar exige sessão real e provisionamento explícito das permissões antes de uso hospedado.
- Financeiro e Files existem como desenho, não como implementações completas.
- Testes de integração existentes usam serviços substitutos e conexão inválida; não comprovam fluxos de PostgreSQL real.

## Encaixe e responsabilidades

Domain: Bar (catálogo/venda), Inventory (locais/razão/contagem), Cash (caixa), Purchases (fornecedor/recebimento), Payments (pagamento/conciliação).
Application: contratos de persistência e serviços de casos de uso; Contracts: DTOs sem custo para operador.
Infrastructure: mapeamentos EF no LongBeachDbContext, transações, concorrência, gateway PagBank.
Api: endpoints internos autenticados; frontend app/: páginas sob /bar.

O Long Beach é fonte oficial de produtos, preços, vendas, estoque, caixa, custos, margens e operadores. PagBank processa cobrança/consulta/estorno/conciliação. Não sincronizar catálogo nem saldo com PagBank.

## Entidades e migrations previstas por incremento

1. BarProductCategory, BarProduct: catálogo, código único, unidades/fator, valores decimais, favorito/ordem, ativo, custo restrito.
2. StockLocation: Almoxarifado e Bar sem inventar produtos/saldos.
3. StockBalance (produto/local único, versão), StockMovement (origem/motivo/ator, antes/depois, imutável): razão e projeção; transferências atômicas.
4. InventoryCount/InventoryCountItem: primeira contagem física e inventários posteriores com fotografia e aprovação.
5. CashRegister/CashSession/CashMovement/CashClosing: sessão exclusiva por caixa, versão, fechamento imutável, justificativa/aprovação.
6. BarSale/BarSaleItem: snapshot de preço/custo, estado e operação; StockReservation para Pix pendente.
7. BarPayment: dinheiro/cartão manual separados da venda; confirmação atômica com baixa/caixa e chave idempotente.
8. Supplier/Purchase/PurchaseItem/PurchaseReceipt: conversão e recebimento idempotente, custo médio ponderado.
9. Perdas/consumo via razão com motivo; cortesia via venda zerada autorizada.
10. Aprovação de inventário: ajustes sem apagar histórico; detectar movimento concorrente à contagem.
11. PaymentProviderTransaction/PaymentWebhookInbox: IPaymentGateway/PagBank, reserva, consulta, webhook autenticado/idempotente, estorno sem retorno automático ao estoque.
12. Indicadores derivados de snapshots, taxas separadas do CMV.
13. PaymentReconciliation: divergências/taxas e trilha de decisão.

Migrations aditivas por etapa; executar por job único somente após homologação/backup. Estornos, correções de razão e reaberturas geram novos registros/eventos.

## Endpoints e telas planejados

/api/v1/bar/catalog, /categories, /products; /stock/locations, /stock/balances, /stock/movements, /stock/transfers;
/counts e /counts/{id}/approve; /cash/registers, /cash/sessions e ações de suprimento/sangria/despesa/fechamento/reabertura;
/sales, itens/checkout/cancel/refund; /payments e cobrança cash/card-manual/pix; /suppliers, /purchases e recebimento;
/stock/losses, /stock/internal-consumption; /dashboard e /reconciliation.
Webhook do provedor terá validação específica, não será uma entrada anônima de aprovação de venda.

Telas no app existente: Produtos/Categorias, Estoque/Locais/Movimentações, Contagem inicial,
Caixa, Vender (touch/carrinho), Vendas, Compras/Fornecedores, Perdas/consumo/cortesia, Inventário, Pix e Conciliação/Indicadores.
Custos/margem só para permissões próprias; operador consulta preços e disponibilidade.

## Aceite e dados pendentes

Testar domínio, autorização inclusive com demo habilitado, auditoria, migrations PostgreSQL, concorrência/idempotência e fluxos API/frontend.
Dados pendentes: catálogo real, categorias, preços/custos, unidades/fatores, fornecedores, mínimos, contagem física por local,
operadores/papéis, caixas/terminais, fundo e limites de aprovação, conta PagBank, credenciais sandbox e homologação,
taxas/prazos, documento do pagador exigido pelo provider, URL pública e processo de conciliação.

Fora de escopo: comandas, mesas, cozinha/KDS, split, receitas/combos completos, terminais integrados/SmartPOS/PlugPag/Tap On,
fidelidade, delivery, e-commerce, fiscal e QuebraNunca.
