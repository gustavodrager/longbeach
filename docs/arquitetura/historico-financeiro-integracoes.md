# Histórico financeiro e fontes externas

O histórico atende somente Owner, com autorização na API. Não cria vendas, cobranças, estoque ou lançamentos contábeis a partir de controles mensais. Toda observação usa GUID próprio, valor inteiro em centavos, estado original, competência ou data real, célula, nome da fonte e SHA-256. Nenhum dado real ou credencial é versionado.

## Planilhas

`scripts/preparar-historico-financeiro.py` lê fontes XLSX reconhecidas sem modificá-las. Produz pacote de staging aceito pelo importador existente. A conferência financeira calcula totais por série, métrica, estado, competência e granularidade. Saldos são separados por data. Totais e modelos de previsão da fonte não são tratados como movimentos. O consolidado principal e o quadro com parcelas de dívidas são visões alternativas; compras e serviços detalhados também podem se sobrepor a esses resumos.

A aplicação exige fingerprint da conferência, transação serializable, lock exclusivo e auditoria. Hash da fonte + célula impedem duplicação da mesma exportação. Mudança de interpretação ou outra fonte com o mesmo controle e período exige conciliação antes de aplicar. Não há substituição silenciosa de versões.

O dashboard usa a última competência do consolidado. O histórico permite mês, controle, indicador, paginação e inspeção de origem. Valores pendentes e estimados preservam seus estados; não entram em um total geral fictício de recebimentos.

### Saldos e extratos na página inicial

`GET /api/v1/financial-history/dashboard-balances`, exclusivo de Owner, lê todas as linhas do último consolidado mensal e a última fotografia de `Saldo Pagbank` separadamente. O resultado mensal calcula receitas menos despesas líquidas. Aceita duas estruturas: receitas da arena + vendas brutas do bar + despesas; ou um único total `receitas-consolidadas` + despesas. Nunca mistura o total com seus componentes nem infere receitas ausentes como zero. Exige a mesma fonte/mês, sem células duplicadas; uma competência incompleta permanece indisponível. Estimativas, parcelas de dívidas do quadro alternativo e controles detalhados não são somados outra vez. A apresentação das despesas no início é positiva, preservando o sinal original no histórico e nos cálculos. Um déficit e um saldo bancário negativo continuam negativos.

O saldo bancário mostra sua data e origem; não representa leitura em tempo real. Saldos em datas distintas nunca são somados. Um extrato sem saldo inicial/final não permite deduzir o dinheiro disponível a partir de seu resultado líquido.

O conversor reconhece o extrato classificado com código de transação, data, descrição, valor e categoria. Rejeita identificadores duplicados, sinais incompatíveis e campos obrigatórios ausentes. Cada linha de detalhe vai para `pagbank-conta`, com métricas `entradas-extrato` e `saidas-extrato`, mantendo código e célula. Os resumos de tabelas dinâmicas não são importados automaticamente. Despesas presentes apenas nesses resumos exigem conciliação e confirmação do meio de pagamento. Quando confirmadas como pagas por outra conta, entram em `despesas-fora-pagbank`, com competência mensal se o dia exato for desconhecido. O dashboard mostra entradas, saídas bancárias e despesas externas separadamente; esse conjunto não substitui o consolidado completo da arena.

Quando o proprietário confirma que a Planilha2 é o consolidado mensal da arena, a opção explícita `--consolidado-extrato` prepara apenas receita e despesa do resumo. Valida os cabeçalhos, uma única competência, valores/sinais de todas as linhas e igualdade entre detalhe, resumo e resultado geral. Não transforma linhas externas adicionadas à planilha em movimentos bancários nem denomina entradas líquidas como vendas brutas. O pacote preserva hash e células e passa pela conferência/aplicação idempotente normal. O modo padrão continua rejeitando códigos bancários duplicados.

Nas compras do bar, a referência da conta identifica quem pagou e o acerto pendente quando um proprietário adiantou recursos. Data, fornecedor, forma informada e referência ficam visíveis na ficha da compra. Registrar e receber produtos não executa pagamento ou compensação; o recebimento atualiza estoque e custo, sem inventar débito no PagBank.

## Indicadores da escola e dos mensalistas

O dashboard Owner consulta `GET /api/v1/financial-history/arena-summary`. A leitura calcula os indicadores sobre todas as observações aplicadas do mês, sem o limite de 50 linhas da tela de histórico. Por padrão cada controle usa sua última competência; um mês explícito não retrocede para dados antigos quando faltam registros. Os cartões mostram a competência e abrem o histórico correspondente.

- Mensalidades e aluguéis pagos: somam apenas `Pago`, em centavos. Nomes pagos usam normalização de espaços/letras; não representam identidade cadastral conciliada.
- A conferir: contam `Não Pago` e `Cobrado`, inclusive valor zero. O campo `Valor Pago` não basta para calcular inadimplência monetária, vencimento ou taxa de cobrança.
- Horas semanais: somam os intervalos por linha de mensalista `Pago`, `Não Pago` ou `Cobrado`. `Entregou Horário` e `Revisão` ficam fora. Falta de dia/intervalo válido torna o total indisponível. A tabela agrupa dia/horário e preserva a quantidade de registros em cada situação; não deduz quadras, reservas datadas, ocupação ou receita projetada.
- Aulas: somente detalhe diário `valor-escalonavel`, em estado `Pago` ou `Aula Ruivo`. Cancelamentos, outros estados e agregados mensais ficam fora. Participações somam as quantidades de alunos e a média divide pelas aulas incluídas; quantidades incompletas impedem total e média. Intervalos incompletos impedem total de horas. A participação não representa aluno único nem presença individual verificada.

A consulta é somente leitura e não gera novas importações, reservas, cobranças ou movimentos. Os recebimentos podem estar incluídos no consolidado; não são somados a ele. Não há migration nova. Validação cobre permissões, fontes/períodos, cancelamentos, valores zero versus ausentes, horários inválidos, totais além da primeira página e comportamento do painel.

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
