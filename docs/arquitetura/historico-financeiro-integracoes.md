# Histórico financeiro e fontes externas

O histórico atende somente Owner, com autorização na API. Não cria vendas, cobranças, estoque ou lançamentos contábeis a partir de controles mensais. Toda observação usa GUID próprio, valor inteiro em centavos, estado original, competência ou data real, célula, nome da fonte e SHA-256. Nenhum dado real ou credencial é versionado.

## Planilhas

`scripts/preparar-historico-financeiro.py` lê fontes XLSX reconhecidas sem modificá-las. Produz pacote de staging aceito pelo importador existente. A conferência financeira calcula totais por série, métrica, estado, competência e granularidade. Saldos são separados por data. Totais e modelos de previsão da fonte não são tratados como movimentos. O consolidado principal e o quadro com parcelas de dívidas são visões alternativas; compras e serviços detalhados também podem se sobrepor a esses resumos.

A aplicação exige fingerprint da conferência, transação serializable, lock exclusivo e auditoria. Hash da fonte + célula impedem duplicação da mesma exportação. Mudança de interpretação ou outra fonte com o mesmo controle e período exige conciliação antes de aplicar. Não há substituição silenciosa de versões.

O dashboard usa a última competência do consolidado. O histórico permite mês, controle, indicador, paginação e inspeção de origem. Valores pendentes e estimados preservam seus estados; não entram em um total geral fictício de recebimentos.

## PagBank EDI

O worker usa exclusivamente GET nos quatro feeds oficiais (`transactional`, `financial`, `cashouts`, `balances`), sem sessão de navegador. A cada dez minutos tenta até sete dias, até ontem no fuso de Brasília, com releitura de dois dias e backoff exponencial limitado a seis horas. Um advisory lock evita coletores concorrentes. Credenciais ficam somente no servidor.

Só confirma uma coleta após validar `VALIDADO=true`, estabelecimento, todas as páginas, contagem e os quatro feeds. Falha reverte a coleta e conserva o cursor anterior. Documentos originais e versões são preservados, com hash; leituras repetidas não duplicam páginas. O relatório Owner mostra a versão mais recente completa de cada feed, incluindo todos os campos e valores originais, sem somar transação e liquidação do mesmo recebível.

Configuração no serviço `api`, separada do token de pagamentos:

- `Integrations__PagBankEdi__Enabled=true`
- `Integrations__PagBankEdi__User=<número do estabelecimento>`
- `Integrations__PagBankEdi__Token=<token EDI privado>`
- `Integrations__PagBankEdi__StartDate=AAAA-MM-DD` (início explícito do histórico autorizado)

A opção é desabilitada por padrão. O painel distingue configuração pendente, primeira leitura, coleta concluída e falha. Não habilitar sem USER/token EDI e período confirmado. O token comum da conta PagBank não serve para EDI.

As novas ativações são solicitadas pelo próprio cliente no portal oficial. Não há Sandbox EDI. A primeira leitura real exige credencial autorizada, conferência de cobertura e acompanhamento do painel. A coleta histórica não implica autorização de pagamentos.

Fontes oficiais: [guia EDI](https://developer.pagbank.com.br/docs/edi), [API e integralidade](https://developer.pagbank.com.br/docs/api-do-extrato-edi), [autenticação Basic](https://developer.pagbank.com.br/v1/reference/api-de-conciliacao-introducao).

## PagVendas

Catálogo e imagens foram importados com proveniência em fluxo independente. A API administrativa de vendas e estoque sem sessão de navegador ainda precisa de confirmação do fornecedor. Não armazenar cookies de Chrome, automatizar login humano ou anunciar sincronização financeira ativa por esse meio. Exportações oficiais entram em staging e conciliação; integrações aprovadas poderão fornecer novas séries usando o mesmo isolamento e auditoria.

## Operação e retorno

Migration `20261006010000_FinancialHistory` adiciona tabelas próprias por job controlado. O downgrade preserva os documentos; uma reversão de versão do aplicativo não deve apagar evidências. Para parar o coletor, desabilitar `Integrations__PagBankEdi__Enabled` e reiniciar a API. Não apagar observações ou cursores para tentar corrigir valores. Promover somente revisão testada, API antes da web; verificar readiness e snapshot Railway conforme o runbook de produção.

Verificação: testes de regras, períodos, estados, fontes sobrepostas, autorização Owner, transação/idempotência/auditoria PostgreSQL, paginação EDI, integralidade, estabelecimento, conversão XLSX e interface de consulta.
