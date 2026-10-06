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
