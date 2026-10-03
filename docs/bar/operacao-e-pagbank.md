# Bar — configuração e homologação

Nenhum deploy ou migration hospedada foi executado nesta entrega. Usar os mesmos serviços API/web/PostgreSQL e o mesmo job migrate-only.

## Permissões

A migration BarPermissions adiciona permissões bar:* e papéis BarOperator, BarSupervisor, StockManager e BarFinance no cadastro de identidade atual. Owner, Administrator e Manager recebem as permissões do Bar; Operations recebe operação de caixa/vendas/saídas simples, sem custos/margem ou cadastro.
As novas definições não atribuem os novos papéis a pessoas automaticamente. Vincular contas individuais aos papéis e renovar o JWT/login após a migration.
O Bar não aparece no modo de demonstração pública. A promoção operacional exige login real no frontend existente. Nunca transformar endpoints do Bar em AllowAnonymous.

## Ambiente PagBank

Configuração pela plataforma de secrets do ambiente, sem versionar valores reais:

| Chave | Valor/uso |
|---|---|
| Payments__PagBank__Enabled | false por padrão; true somente após configuração e homologação |
| Payments__PagBank__BaseUrl | https://sandbox.api.pagseguro.com/ ou https://api.pagseguro.com/ |
| Payments__PagBank__Token | token da conta no ambiente correspondente |
| Payments__PagBank__WebhookUrl | URL HTTPS existente da API + /api/v1/integrations/pagbank/webhook |
| Payments__PagBank__WebhookPublicKey | chave pública X.509/SPKI em Base64 fornecida pelo PagBank; verificar e atualizar na rotação |
| Bar__StockOutputApprovalLimit | limite monetário para perda/consumo sem supervisor; padrão R$ 100,00, validar com operação |

A documentação oficial consultada em 03/10/2026 apresenta [Pix via charges na API Orders](https://developer.pagbank.com.br/reference/criar-pedido-com-qr-code-pix-v2), [consulta de pedido](https://developer.pagbank.com.br/reference/consultar-pedido), [cancelamento de pagamento](https://developer.pagbank.com.br/reference/cancelar-pagamento) e [assinatura ECDSA de webhook](https://developer.pagbank.com.br/reference/validacao-de-autenticidade).
A documentação de assinatura pede confirmação do endpoint de chaves em produção; confirmar o contrato habilitado para a conta e a rotação antes da ativação.
Não aceitar webhook sem assinatura válida. O corpo original é validado antes de parse, não armazenamos payload bruto/PII; guardamos hash, pedido e resultado normalizado. A confirmação consulta o provedor com a credencial da conta e compara referência do pagamento, valor e moeda.

## Fluxo e recuperação

- Dinheiro/cartão manual: preço/custo congelados no rascunho; confirmação única, baixa e caixa na mesma transação local. Operador deve confirmar o resultado na maquininha antes de registrar cartão manual. Nunca registrar PAN/CVV.
- Pix: criar registro pendente e reserva antes da chamada externa; repetir criação usa a mesma chave. Payer name/email/documento ficam somente na requisição/memória, não na auditoria ou banco do Bar.
- Falha entre criação externa e vínculo local: retomar em Vendas usando o pagamento pendente e sua chave original, com os mesmos dados do pagador. Não alternar para dinheiro até esclarecer o resultado no provedor.
- Webhook, consulta do operador e worker interno a cada minuto convergem pela mesma regra idempotente. O worker roda no processo da API existente.
- Expiração só libera reserva após status terminal confirmado pelo provedor, evitando liberar produto que já foi pago. Cobranças pendentes impedem fechamento do caixa.
- Estorno Pix consulta/processa cancelamento no provedor com chave estável e só reverte localmente após estorno total confirmado. Estorno não devolve estoque implicitamente; informar Todos/Alguns/Nenhum.
- Conciliação inicial é conferência manual documentada: taxa + líquido = bruto aprovado, um registro por pagamento. Não há ingestão EDI/recebíveis bancários nesta fase.
- Eventos SalePaid, PurchaseReceived, PaymentFeeRegistered, CashDifferenceApproved e InventoryLossApproved ficam duráveis em bar_events. O domínio Financeiro ainda precisa de consumidor/classificação/contas; não há liquidação contábil fictícia.

## Dados para entrada em operação

Cadastrar categorias, produtos/preços/custos/unidades/fatores, mínimos e fornecedores. Registrar contagem física real por local e aprovar. Cadastrar caixa físico, terminal e fundo inicial. Validar diferenças, limite de perdas, cancelamentos e responsáveis.
Imagens aceitam referência HTTPS; não foi criado storage paralelo. Upload/varredura de fotos e comprovantes dependem do módulo Files/storage existente ainda não implementado.

## Homologação obrigatória

1. Executar CI com PostgreSQL de teste; aplicar migrations aditivas por job único em Staging.
2. Confirmar autenticação/perfis, limites de saídas, reabertura, idempotência e concorrência entre dois terminais.
3. Exercitar criação/repetição/timeout Pix, webhook duplicado/assinado/inválido, confirmação após expiração, cancelamento e estorno em sandbox com a conta habilitada.
4. Confirmar formato da assinatura e rotação de chave da conta antes de produção.
5. Validar equipamentos touch e comprovante; conferir estoque físico, caixa e conciliação.
6. Promover os artefatos pelo CI/CD existente somente após aceite; preservar os controles atuais e os dados históricos.

Rollback de aplicação pode desativar o Bar/PagBank sem apagar tabelas. Não remover migrations/tabelas com registros financeiros ou de estoque já confirmados. Restauração de dados exige plano e reconciliação, não apagar razão.
