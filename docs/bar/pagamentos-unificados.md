# Operação de pagamentos — Bar, Quadra e área do aluno

## Telas e permissões

- `/minhas-contas`: contas do usuário autenticado, separadas em Bar e Quadra, com histórico, Pix, cartão, comprovante individual e assinaturas.
- `/recebimentos`: gestão (`finance:read`). Vincular conta ao usuário responsável exige `finance:write`. Matrícula exige selecionar explicitamente seu aluno.
- `/recebimentos/conciliacao`: documentos EDI validados e liquidações associadas. A justificativa do vínculo fica na auditoria.
- O atendimento do Bar continua disponível e oferece Pix, dinheiro, cartão na maquininha e crédito integrado. Dinheiro e maquininha conservam as regras existentes.

Criar usuários e conceder acesso Student usa o processo individual existente. Não criar associação por nome. Contas sem vínculo continuam na operação interna, preservando histórico e baixas manuais. Reservas e mensalidades são pagas pelo saldo integral; comandas permitem valores parciais. Não há pagamento conjunto de Bar e Quadra.

## Configuração

Definir somente no ambiente Long Beach correspondente, usando o gerenciador de segredos. Nada depende do QuebraNunca.

| Configuração | Finalidade / padrão |
|---|---|
| `Payments__Billing__Enabled` | Novos pagamentos/adesões pelo serviço de contas; `false` |
| `Payments__PagBank__Enabled` | Autoriza criação de novos pedidos; `false` |
| `Payments__PagBank__PixEnabled` | Pix quando o provedor está ativo; `true`, preserva configuração existente |
| `Payments__PagBank__CardEnabled` | Crédito integrado; `false` |
| `Payments__PagBank__BaseUrl` | `https://sandbox.api.pagseguro.com/` ou `https://api.pagseguro.com/` |
| `Payments__PagBank__Token` | Token exclusivo do ambiente |
| `Payments__PagBank__WebhookUrl` | HTTPS da API + `/api/v1/integrations/pagbank/webhook` |
| `Payments__PagBank__WebhookPublicKey` | SPKI/X.509 Base64 confiável para verificação inicial |
| `Payments__PagBank__RefreshWebhookKeys` | Consulta `GET /public-keys?type=webhook`, cache de cinco minutos; `false` até validar endpoint no ambiente |
| `Payments__PagBankSubscriptions__Enabled` | Novas assinaturas; `false` |
| `Payments__PagBankSubscriptions__BaseUrl` | `https://sandbox.api.assinaturas.pagseguro.com/` ou `https://api.assinaturas.pagseguro.com/` |
| `Payments__PagBankSubscriptions__Token` | Credencial específica de recorrência, PJ Vendedor habilitada |
| `Integrations__PagBankEdi__Enabled` | Coletor EDI independente; `false` |
| `Integrations__PagBankEdi__User` / `Token` / `StartDate` | Estabelecimento, credencial EDI e data inicial `AAAA-MM-DD` |

Cadastrar no produto Recorrência o callback HTTPS `/api/v1/integrations/pagbank/subscriptions/webhook`. Provisionar previamente as chaves públicas de cartão dos dois produtos, consultadas em `/public-keys/card` (Pedidos) e `/public-keys` (Recorrência). Não confundir tokens nem chaves entre os produtos.

## Entrada em operação

1. Aplicar migrations por job único no banco de homologação. Elas preservam registros existentes e adicionam seis tabelas `billing_*`.
2. Configurar token, chaves, callback e SDK oficial. Não habilitar captura de bodies no proxy, APM ou logs. Assinatura envia o código de segurança transitório conforme contrato específico; o pagamento avulso envia apenas cartão criptografado.
3. Habilitar base e Pix no sandbox. Testar dois usuários, uma comanda, uma reserva e uma matrícula. Confirmar baixa única na origem; estorno não movimenta estoque nem agenda.
4. Testar crédito à vista aprovado, recusado e timeout. Retomar a mesma operação. Desativar criação e verificar que consulta/webhook/recuperação continuam funcionando.
5. Homologar assinatura com vencimento hoje e futuro, ciclos 29–31, cobrança negada, retentativa, cancelamento com cobrança em andamento, estorno total e mensalidade previamente quitada. Conferir que `occurrence` identifica o ciclo esperado e o retorno paginado inclui todas as faturas/tentativas. Estorno parcial de assinatura não é suportado pelo adaptador.
6. Testar grupo fixo em duas competências: exatamente uma cobrança por mês; geração repetida não duplica encontros. Acordos de quinto encontro Extra/A confirmar permanecem avulsos. Divergências de agenda/valor bloqueiam conciliação automática e precisam ser corrigidas pela gestão.
7. EDI não tem sandbox equivalente: validar habilitação, primeira coleta, D+1, `VALIDADO=true`, paginação e `provider_sync_state`. Associar somente evento simples elegível cujo identificador foi conferido. Antecipação, parcelamento ou estorno exigem tratamento separado e não aparecem como associação automática.
8. Confirmar credenciais/habilitações de produção. Publicar pelo fluxo existente com aprovação do environment e artefato identificado por commit/digest; habilitar cada recurso após aceite.

Os testes locais usam PostgreSQL descartável e provedores simulados. Eles não comprovam homologação do PagBank, habilitação da conta ou coleta real EDI.

### Ensaio do sandbox — 2026-10-07

Executado com a credencial de teste já armazenada localmente para Long Beach, sem modificar Railway, variáveis ou dados de produção. A sonda temporária referenciou o `PagBankPaymentGateway` real, bloqueou hosts diferentes de `sandbox.api.pagseguro.com` e não registrou token, cartão, criptograma ou corpo de resposta. Não confundir esse ensaio do adaptador com um checkout completo da aplicação: os fluxos de contas/estoque/autorização foram exercitados separadamente com PostgreSQL descartável e provedor simulado.

| Cenário | Resultado observado |
|---|---|
| Autenticação e chaves públicas | Consultas de cartão e webhook responderam HTTP 200; chave de webhook reconhecida como EC |
| Pix R$ 10 | QR Code criado, consulta posterior `PAID`; estorno parcial R$ 4 e complemento R$ 6 confirmados, total R$ 10 e estado `CANCELED` |
| Pix R$ 150 | Começou `WAITING`; consulta posterior confirmou `PAID`, conforme cenário com atraso |
| Pix R$ 250 / R$ 350 | `WAITING` / `DECLINED`, respectivamente |
| Repetição da criação Pix | A mesma chave retornou HTTP 500 nos três casos inicialmente `WAITING`; o recusado retornou o mesmo pedido. Consultas recuperaram os pedidos existentes. A repetição dos Pix pendentes não está homologada |
| Cartão no navegador | Dois cartões fictícios oficiais criptografados com o SDK oficial no Chrome, perfil Long Beach; somente criptogramas seguiram para a sonda local |
| Pedido com cartão | Antes da correção, HTTP 400 / código `40001`, campo `items`. O adaptador agora envia um item de quantidade 1 e valor em centavos igual à cobrança |
| Cartão aprovado / recusado após correção | `PAID` / `DECLINED`; repetição com a mesma chave preservou o pedido nos dois casos |
| Estorno de cartão | HTTP 400 / código `40008` (`not found`); consulta continuou `PAID`, estornado zero. Não homologado |
| Notificações HTTPS | Receptor temporário recebeu chamadas após criar Pix, sem `x-payload-signature`; a segunda conferência também não encontrou `x-authenticity-token`. Rejeitadas com HTTP 401. A identidade dessas chamadas não foi autenticada; não tratar sua chegada como confirmação de pagamento |
| Recorrência | Credencial específica não disponibilizada neste ensaio; adaptador não homologado contra o provedor |

O ensaio do estorno parcial Pix demonstrou confirmação assíncrona: a primeira consulta ainda não mostrava o reembolso, e uma consulta posterior confirmou R$ 4. Conservar a operação pendente e conferir o provedor; não considerar esse atraso como autorização para criar nova operação. Os pedidos e IDs da sonda estão apenas nas evidências locais, fora do Git.

EDI: 83 exemplos JSON foram extraídos da página oficial [Cenários de teste](https://developer.pagbank.com.br/docs/cenarios-de-teste) e passados ao parser real. Foram aceitos 82 exemplos, com 142 detalhes. Um exemplo de **Cenário 9: Venda Split**, com dois detalhes de estabelecimentos diferentes, foi rejeitado por `EDI_MERCHANT_MISMATCH`, preservando o isolamento atual. Isso valida leitura estrutural, não classificação financeira completa, paginação real nem coleta com credencial EDI. Nenhuma chamada EDI de produção foi feita.

Validação automatizada: 47 testes unitários selecionados, 104 de integração e 13 de interface aprovados (164 casos distintos); os quatro testes do adaptador e seis de contas PostgreSQL foram repetidos após a correção. Builds API e PWA aprovados. A suíte interna cobre autorização entre alunos, concorrência, confirmação/estorno, recuperação e documentos EDI, mas usa respostas simuladas do provedor.

Ainda não liberar pagamentos de produção com base neste ensaio. Para concluir: esclarecer o HTTP 500 nas repetições Pix e o `40008` no estorno de cartão; confirmar com PagBank a assinatura efetivamente disponibilizada às notificações da conta, preservando a rejeição de eventos não autenticados; disponibilizar credencial de recorrência e validar seus ciclos; executar checkout completo em ambiente Long Beach de homologação com callback próprio. A alteração de `items` fica em revisão e não foi publicada em produção nesta etapa.

Referências: [Simulador](https://developer.pagbank.com.br/docs/simulador), [cartões fictícios](https://developer.pagbank.com.br/docs/cartoes-de-teste), [pedido com cartão](https://developer.pagbank.com.br/reference/criar-pagar-pedido-com-cartao), [assinatura de notificações](https://developer.pagbank.com.br/reference/validacao-de-autenticidade). SDK público usado: SHA-256 `19c2123b881f72e540ffb925f926a18c47ac49d79576f3e48fdf2e7c37d77112`.

### Investigação adicional dos erros — 2026-10-07

Chamadas diretas HTTPS ao sandbox, independentes do adaptador, reproduziram o HTTP 500 na repetição imediata de um Pix R$ 250. Repetir o corpo byte a byte e a mesma chave três segundos depois retornou HTTP 201 com o **mesmo pedido**, ainda `WAITING`; GET confirmou o identificador e o valor. A falha foi transitória nesse ensaio e não comprova duplicação. Um segundo pedido incluindo `items` teve ambas as repetições bem-sucedidas, mas uma amostra por formato não permite atribuir o resultado a esse campo nem justificar uma alteração do Pix. A criação de cartão continua com a correção de `items`, validada separadamente.

O pedido de cartão continuou consultável (HTTP 200), `PAID`, R$ 10 pagos, zero estornado e com link `CHARGE.CANCEL`. A operação de estorno que havia retornado `40008` passou a retornar HTTP 409 / `40005` (`idempotency_key_in_use`) ao repetir a mesma chave, inclusive com serialização compacta do corpo original. A consulta posterior permaneceu sem estorno. A [tabela oficial](https://developer.pagbank.com.br/reference/codigos-de-erro-order) classifica `40008` como indisponibilidade temporária; a causa interna e o estado da operação exigem esclarecimento do PagBank. Não interpretar `409` como reembolso concluído e não trocar a chave para contornar a pendência. Uma sondagem adicional GET `/charges/{id}` retornou 406; ela não faz parte do fluxo do adaptador, que consulta `/orders/{id}`, e não prova inexistência da cobrança.

No mesmo caminho HTTPS do receptor temporário, uma mensagem de controle com chave ECDSA descartável foi validada pelo verificador real (200); corpo alterado e assinatura ausente foram rejeitados (401). Os dois cabeçalhos de assinatura e os bytes do corpo atravessaram o túnel intactos. Esse controle usa chave sintética isolada e não comprova uma assinatura PagBank. A chamada posterior com JSON de pedido e referência correspondente ao novo Pix não trouxe `x-payload-signature` nem `x-authenticity-token`; foi rejeitada com 401. Foram preservados somente nomes dos cabeçalhos, estrutura, hash e correspondência da referência, sem corpo bruto, token ou dados do pagador. A origem continua não autenticada. O resultado afasta perda dos cabeçalhos no transporte testado, mas não identifica a causa no serviço de notificações.

A consulta autenticada posterior do Pix usado no diagnóstico de callback confirmou `PAID`, BRL, R$ 15 e referência correta. Essa consulta confirma o pagamento no provedor, não autentica a chamada sem assinatura.

Conclusão operacional: manter a mesma operação nas retomadas Pix, consultar pagamentos conhecidos e conservar estornos incertos como pendentes. Não acrescentar atraso fixo de três segundos como suposta garantia do provedor e não flexibilizar assinatura. Encaminhar request IDs, horários e identificadores sandbox ao suporte para esclarecer estorno e assinatura antes do aceite. A [homologação oficial](https://developer.pagbank.com.br/docs/solicitar-homologacao) exige envio e validação das evidências; o ensaio local não substitui esse processo. Nenhum chamado foi enviado nem configuração de produção alterada durante esta investigação.

## Falhas e recuperação

O trabalhador consulta operações em andamento a cada minuto. Logs `Billing recovery deferred`, `PagBank reconciliation deferred` e `Tab refund reconciliation deferred` registram apenas identificadores/tipos de falha. Acompanhar pendências antigas e cancelamentos em confirmação.

Timeout não libera o saldo. Usar “Retomar pagamento pendente” e a mesma operação. Se a intenção não obteve identificador externo em 24 horas, não recriar: conferir a referência local no PagBank. A integração bloqueia retentativa tardia para evitar ultrapassar a retenção de idempotência do provedor. Corrigir por procedimento administrativo auditado; não editar saldo nem apagar intenção para forçar outra cobrança.

Notificação inválida de Pedidos é rejeitada. Notificação válida provoca consulta autenticada; nunca é usada diretamente para dar baixa. Uma confirmação tardia de operação cancelada, duplicidade externa, valor/moeda divergente ou competência duplicada exige conciliação.

Assinatura cancelada interrompe o futuro após confirmação. Valores ainda em tentativa permanecem reservados até a consulta completa. Devolver dinheiro e encerrar matrícula são ações separadas. Falha financeira não cancela aula/reserva.

Para interromper novas operações, desligar `Payments__Billing__Enabled`, `Payments__PagBank__Enabled` e/ou `Payments__PagBankSubscriptions__Enabled` conforme o alcance desejado. Manter token, chaves, workers e callbacks para consultas, estornos e recuperação. Desligar EDI usa sua própria configuração. Não reverter migrations nem apagar registros financeiros.

## Referências oficiais consultadas

- [Pedidos com cartão](https://developer.pagbank.com.br/reference/criar-pagar-pedido-com-cartao)
- [Autenticidade e rotação de chaves](https://developer.pagbank.com.br/reference/validacao-de-autenticidade) — a própria documentação solicita confirmar a URL de produção do serviço de chaves.
- [Autenticação de recorrência](https://developer.pagbank.com.br/docs/autenticacao-pagamentos-recorrentes)
- [Faturas da assinatura](https://developer.pagbank.com.br/reference/listar-faturas-de-assinatura)
- [EDI](https://developer.pagbank.com.br/docs/edi)
