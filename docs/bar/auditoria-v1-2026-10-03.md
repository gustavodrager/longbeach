# Auditoria real e matriz Bar V1

Data: 03/10/2026. Repositório: /Users/gustavo-drager/longbeach/longbeach-os. HEAD observado: b5289db. Escopo: arquivos versionados e alterações locais existentes; não é auditoria de produção nem de dados do banco. Há dezenas de alterações prévias e arquivos não versionados; não incluí-los em commits desta revisão.

## Fundação verificada por leitura de código
LongBeach.sln separa Domain, Application, Infrastructure, Contracts e Api; global.json fixa SDK 10.0.401. app/package.json contém React 19, TypeScript, Vite, React Query, Router, PWA e Capacitor. LongBeachDbContext usa EF/Npgsql e mapeamentos por domínio. Identity contém User/Role/Permission, refresh rotativo, JWT, cookie/CSRF e políticas de permissão. Autenticação Google e PagBank existem na infraestrutura. DI registra os seis serviços Bar e IPaymentGateway.

OperationalRecord armazena students/team/inventory/projects em JSON: não constitui domínio Pessoas normalizado nem ledger de estoque. Financeiro tem permissões e documentos; BarEvent existe, mas não foi encontrado consumidor de integração financeira. Files/storage permanece desenho: ImageUrl HTTPS não é upload. Serilog, ProblemDetails, auditoria por interceptor e health checks são reaproveitáveis.

.github/workflows/ci.yml constrói/testa .NET e React, provisiona PostgreSQL 17 e aplica migrations em Test. Dockerfiles, compose, Railway e release-images existem; configuração não prova execução/promoção. app/App.tsx oculta Bar no modo demo. OperationalEndpoints permite acesso anônimo quando publicDemo; não reutilizar essa autorização para comandas.

## Matriz existe / reutilizar / adaptar / criar
| Capacidade | Existe no código | Reutilizar | Adaptar | Criar / gap |
|---|---|---|---|---|
| Fundação/API/app/banco | Cinco camadas, DbContext, shell/PWA | Toda infraestrutura atual | Navegação/contratos | Nenhum serviço independente |
| Identidade | User e JWT/refresh | Sessões e autenticação atuais | Vínculo opcional cliente↔User | Acesso restrito do visitante à conta |
| Pessoas/cliente | OperationalRecord students/team | IDs somente com proveniência validada | Contrato com futuro Pessoas | Perfil cliente mínimo; não copiar alunos automaticamente |
| Permissões | BarOperator/Supervisor/StockManager/BarFinance, Owner/Admin | Policies e bootstrap | Granularidade por ação/objeto | Permissões próprias de conta/consumo e cliente |
| Catálogo | BarProduct/Category; Code obrigatório; Barcode/ImageUrl opcionais | Cadastro, DTOs, mapeamentos | Busca/scanner e política de custo | Receitas versionadas e componentes |
| Conta/comanda | Não existe | Catálogo e validações | PDV para lançar em conta | Conta, participantes/acessos, estados |
| Consumo compartilhado | BarSaleItem snapshot; venda pertence a ActorId | Snapshot de preço/custo | Preservar venda histórica | Consumo com origem/ator e reversão |
| Pagamento | BarPayment; manual/Pix/IPaymentGateway | Adapter e idempotência | Cardinalidade, saldo/alocação, estorno parcial | Alocações e reversões por valor |
| Estoque | StockLocation/Balance/Movement/Reservation, InventoryCount | Ledger, locais, perdas, transferência | Baixa no consumo, ingredientes e reversões | Reservas por consumo quando necessário |
| Custo/CMV | Média no recebimento; custo snapshot na venda | Cálculo e histórico | Garantir custo histórico de consumo preparado | CMV dos ingredientes e integração financeira |
| Caixa | Register/Session/Movement/Closing | Abertura/reforço/sangria/divergência | Associar dinheiro ao recebimento, não à conta | Nenhum segundo ledger |
| Compras/fornecedor | Supplier/Purchase/Item/Receipt | Serviços existentes | UI multiitem/parcial/documentos | Integração com Files quando disponível |
| Auditoria | AuditLog/interceptor; triggers de ledger | Trilha oficial | Origem, motivo, correlação, reversões | Não criar segunda AuditEntry |
| Arquivos | ImageUrl; sem FileObject/adapter | Futuro módulo oficial | Referências opcionais | Files compartilhado antes de uploads |
| Financeiro | Permissões e BarEvent; sem liquidação | Fatos duráveis | Consumidor idempotente e classificação | Domínio financeiro real; não duplicar no Bar |
| Cliente/PWA/QR | PWA existe; Bar exige operador | Mesmo app/API | Autorização por conta e UX móvel | Vínculo QR seguro, consumo e pagamento próprios |
| Indicadores | Dashboard e conciliação manual | Consultas existentes | Pagamentos parciais, receitas e fatos por período | Relatórios de operação por conta/origem |
| Automação | Worker PagBank | Recuperação e adapter | Contratos e observabilidade | Hardware/IA somente Bar 7 |

## Conflitos e riscos concretos
1. BarSale.SessionId obrigatório e BarSalesService.Create exige caixa aberto. Comanda não deve depender da abertura de caixa; não reutilizar BarSale como conta.
2. SalesModel cria índice único BarPayment.SaleId; Pay cobra sale.Total e conclui venda/baixa; Refund e serviços Pix usam Single por SaleId. Pagamentos parciais/mistos exigem mudança coordenada, não simples remoção de índice.
3. Own exige mesmo ActorId: bloqueia atendimento compartilhado. Introduzir acesso por conta/ação; preservar autoria individual do consumo.
4. Consumo hoje baixa estoque ao pagamento. Separar evento de entrega/consumo do evento financeiro evita dupla baixa em pagamentos parciais.
5. BarProduct.Change aceita AverageCost no cadastro, inclusive edição. Risco de alterar custo médio fora de recebimento/ajuste auditado: definir custo inicial versus custo derivado antes de ampliar operação.
6. Custos podem vazar ao estender catálogo para cliente; usar projeções públicas e negar acesso por objeto a contas alheias.
7. Auditoria e triggers bloqueiam mudanças de livros listados, mas bar_payments é entidade mutável. Nova reversão financeira deve ter registros próprios imutáveis e não depender somente de State=Refunded.
8. BarEvent tem unicidade Name/OriginId: eventos repetidos por conta devem usar origem específica de consumo/pagamento/reversão. Não publicar tudo com ContaId.
9. Estorno Pix externo acontece antes da transação local em BarSalesService. Falha local após sucesso remoto exige reconciliação/retry durável antes de ampliar estornos.
10. BarPostgresTests cobre fluxo sequencial, não prova duas sessões concorrentes, assinatura real PagBank ou homologação. Ledger/migrations precisam teste de banco real.
11. Estoque JSON e ledger coexistem. Não importar quantidade editável como contagem física; preservar legado e reconciliação explícita.

## Migrations encontradas
InitialCreate; OperationalRecords; BarCatalog; BarStock; BarCash; BarSales; BarPurchases; BarPixReconciliation; BarPaymentTendered; BarCatalogMetadataDiscounts; BarLedgerIntegrity; BarPermissions. Snapshot e target models existem. BarLedgerIntegrity instala triggers imutáveis em movimentos/fechamentos/itens/recebimentos/conciliações/eventos. Não reescrever migrations publicadas; não aplicar em ambiente hospedado nesta revisão.

## Gate de implementação
Fundação técnica existe; fundação funcional da comanda ainda não está validada. Bloqueios: conflito de ciclo venda/consumo/pagamento, cardinalidade única, base local não reconciliada teste PostgreSQL pendente e falha confirmada de HasPendingModelChanges (ver validacao-v1.md). Nesta revisão apenas documentação nova; primeira fatia recomendada consta do backlog. Resultados de testes são registrados separadamente em validacao-v1.md.
