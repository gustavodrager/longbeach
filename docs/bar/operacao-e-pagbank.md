# Bar — configuração e homologação

Nenhum deploy ou migration hospedada foi executado nesta entrega. Usar os mesmos serviços API/web/PostgreSQL e o mesmo job migrate-only.

## Operação no tablet — implementação local de 19/10/2026

- Long Beach controla produtos, preços, compras, reservas, entregas, vendas e estoque. A maquininha recebe apenas o valor digitado pelo operador. Não existe integração automática com o terminal.
- Vender oferece busca sem diferença de acentos, notas recolhidas, resumo editável e destino escolhido na própria tela. A transferência move apenas rascunhos, exige confirmação e nunca substitui outro rascunho. Produtos sem controle de estoque continuam disponíveis.
- Rascunhos e operações pendentes ficam no dispositivo por usuário e comanda. Sem internet, só editar rascunhos. Ao reconectar, atualizar catálogo e comanda e conferir diferenças antes de registrar. Falta de armazenamento bloqueia envio de pedido que não possa ser recuperado.
- Recebimento de balcão oferece Débito, Crédito e Pix na maquininha, além de Dinheiro. O operador confere o valor no terminal e declara a aprovação. Mudar valor/modalidade invalida a confirmação; NSU é opcional. Recusa/cancelamento não é recebimento. Não digitar dados do cartão no tablet.
- Timeout: manter o pagamento pendente e usar Consultar ou repetir confirmação. O corpo e UUID originais sobrevivem ao recarregamento. Nunca realizar outra cobrança na maquininha para repetir um registro local.
- `TerminalManual` registra `TerminalType` Debit/Credit/Pix, responsável e instante da confirmação. `CardManual` histórico permanece sem modalidade inferida. Quando há caixa próprio aberto no mesmo local, o recebimento manual se vincula ao turno sem alterar dinheiro esperado; sem caixa aberto, continua disponível nos relatórios. Fechamento separa modalidades e devoluções do dinheiro físico.
- Estorno manual registra uma devolução já confirmada pelo operador na maquininha. Não chama o banco e não devolve estoque. Devolução física segue a ação própria, com motivo e auditoria.
- Compra recebida aumenta físico; aceite reserva; entrega baixa; cancelamento libera reserva. Perda, consumo interno e inventário seguem separados. O inventário mantém encerramento com campos vazios zerados mediante confirmação e bloqueios por movimentos/reservas concorrentes.
- Pix/cartão online existentes continuam consultáveis; a retomada do atendente usa a tela separada `/atendimento/pagamento-online/:tabId/:paymentId`, sem escolha de nova operação, modalidade ou valor. Os caminhos do cliente permanecem disponíveis. EDI permanece evidência financeira separada; não cadastra produtos nem altera preços, vendas ou estoque.

### Entrada em operação e publicação posterior

Conferir catálogo ativo e fotos, inventário físico e abertura/fechamento de caixa. Usar contas individuais no tablet, sem compartilhar conta genérica. A emulação de 800×1280 e 1280×800 não substitui a validação no Redmi físico, inclusive teclado virtual e alternância de rede.

A migration `20261020011757_BarTerminalManual` adiciona coluna nullable e amplia a restrição de modalidades; não atualiza linhas antigas. Publicar somente após autorização explícita: backup verificado, migration em job único, API antes da interface e artefato identificado. Depois de novos pagamentos `TerminalManual`, a migration reversa não deve ser executada: sua restrição recusa apagar a modalidade de dados existentes. Reversão exige plano próprio de compatibilidade, sem recategorizar histórico.

Esta entrega não ativa C6, não emite documento fiscal e não oferece vendas totalmente offline. As fotos antigas continuam usando as URLs existentes; migrar o armazenamento de imagens é uma etapa distinta do bloqueio da aplicação de catálogos.

### Validação local desta implementação

- Frontend: 422 testes em 46 arquivos, todos aprovados; a revisão final de rótulos passou novamente nos 79 testes de atendimento. TypeScript, Vite e PWA compilados.
- PostgreSQL 17 fictício: suíte completa com 413 unitários e 338 integrações; após acrescentar os últimos casos, regressão afetada com 88 unitários e 175 integrações aprovada.
- PostgreSQL 18 descartável: suíte completa com 419 unitários e 339 integrações aprovada. O ajuste final de `canApply: false` passou novamente nos três testes de catálogo, com build da API Release.
- Migration testada em banco novo e em banco fictício com histórico: 16 pagamentos `CardManual` mantiveram modalidade nula; nenhuma classificação retroativa.
- Navegador conectado à API e banco locais: venda fictícia #163, entrega de uma unidade, débito manual de R$ 5,00, comprovante e saldo devido zero. Não houve chamada de pagamento real.
- Viewports conferidos: 1440×900, 1280×800, 800×1280, 390×844 e 320×740. Busca sem acento, resumo, nomes longos, botões de pelo menos 48 px e ausência de overflow horizontal. A grade de recebimento e o rodapé de revisão foram corrigidos após problemas observados em 320 px.
- Casos automatizados: três modalidades de terminal, dinheiro/troco, parcelas, aprovação ausente e invalidada, clique repetido, resposta perdida e recarregamento, rascunho por usuário/comanda, destino ocupado, armazenamento indisponível, reconexão com preço alterado, item desativado durante recuperação, bloqueio de catálogo, estorno sem estoque, isolamento EDI e recuperação online em tela separada.
- Verificações da matriz da CI executadas localmente. Nenhuma execução remota GitHub Actions, push, PR ou publicação faz parte desta etapa. O cache NuGet reportou NU1900 para consulta de vulnerabilidades indisponível; compilação e testes concluíram normalmente.
- Evidências visuais locais: `outputs/tablet-bar-2026-10-19` no workspace LongBeach, fora do repositório. O Redmi físico e o inventário real ainda precisam ser conferidos antes do uso diário.

## Referência dos fluxos anteriores e de pagamento online

As seções abaixo documentam a integração anterior. Para balcão/tablet, prevalecem as regras acima; cadastro e estoque não exigem PagBank.

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

## Contas da Quadra e área do aluno

A operação compartilhada, o cartão integrado, as assinaturas e a associação EDI estão descritos em [Pagamentos unificados](pagamentos-unificados.md). O crédito integrado usa `CreditCard`; `CardManual` continua significando aprovação externa na maquininha. Desabilitar novas cobranças não interrompe consulta, webhook, estorno ou recuperação dos registros já iniciados.

## Estoque único do Bar — ajuste de 08/10/2026

O proprietário confirmou um único estoque físico para o Bar. A interface passa a usar automaticamente o cadastro Bar já utilizado no atendimento, sem coluna ou filtro Local e sem ações de criar locais ou transferir estoque. Contagens novas, recebimentos de compras, perdas/consumo interno e abertura de caixa usam o mesmo cadastro Bar, identificado de forma única; falha de consulta, cadastro ausente ou ambíguo impedem essas novas operações.

A tela principal mostra os saldos do Bar. URLs antigas com filtro de local não mudam essa seleção. Saldos não zerados em outros cadastros, se existirem, continuam visíveis em uma seção separada de conferência, sem somar ao disponível do atendimento. Movimentações e inventários anteriores são preservados, inclusive seus vínculos originais. Nenhum saldo é transferido, reclassificado ou apagado automaticamente.

Este ajuste é de interface: os contratos da API e os registros históricos de locais permanecem compatíveis. Não equivale a uma consolidação de saldos no banco nem ao estoque futuro por unidade previsto no ADR-008. Testes de interface verificam destino Bar nos quatro formulários, tratamento de cadastro ausente/ambíguo e preservação separada de saldos antigos; build PWA aprovado. A publicação efetiva deve ser conferida no manifesto de produção.
