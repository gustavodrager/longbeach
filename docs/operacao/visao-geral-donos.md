# Visão geral dos donos

Este documento descreve a regra de acesso e a leitura do painel implementados no código. A publicação e a conferência das contas reais devem constar no recibo da release; este documento não comprova alteração em produção.

## Acesso completo dos donos

`StaffAuthorization.Resolve` concede o perfil completo de gestão somente quando `IsOwner` confirma a identidade pelo estado atual e por `StaffAccess:OwnerUserIds`. Continuam obrigatórios: conta ativa, primeiro acesso concluído, forma de entrada habilitada, perfil exclusivamente `Manager` e vínculo de equipe habilitado e compatível, quando houver.

O dono confirmado recebe todas as permissões de `Manager`, `CanManageStaff = true` e `StaffAccess = null`. Isso permite os fluxos e menus de gestão mesmo que o tipo compartilhado Gestor tenha sido limitado. O tipo persistido não é alterado e continua limitando os demais funcionários. Nome, e-mail e claims antigas não promovem uma conta a dona. A validação da sessão recompõe permissões e escopo a partir da conta atual; retirar um ID da configuração efetiva de donos devolve o escopo normal dessa conta.

`GET /api/v1/owner-overview?month=AAAA-MM` exige a política de dono, além da regra explícita do escopo da API. A interface consulta e apresenta o painel somente com a capacidade de dono. Uma resposta `401` ou `403` oculta valores anteriormente carregados. A definição de uma conta de operação do Bar permanece no fluxo de Equipe e acessos; este painel não amplia seus menus nem suas ações.

## Base atual e metas

O painel tem duas referências temporais. A base de contratos e a grade refletem `AsOfDate`, no horário de São Paulo. O mês escolhido altera somente os blocos financeiros; não reconstrói uma carteira histórica a partir do status atual dos cadastros.

| Indicador | Definição |
| --- | --- |
| Alunos | Pessoas distintas por `studentId` nas matrículas elegíveis da grade ativa. |
| Matrículas / vagas ocupadas | Vínculos ativos de aluno com uma turma semanal. Um aluno em duas turmas ocupa duas vagas. |
| Turmas | Turmas ativas, iniciadas e não excluídas. Matrículas futuras, canceladas antes do início ou em turma fora da grade atual não ocupam a meta. |
| Mensalistas | Grupos com contrato recorrente ativo e datas válidas. Integrantes do grupo não multiplicam a mensalidade. |
| Mensalidades conhecidas | Soma dos preços mensais informados nas matrículas e nos grupos ativos. Não é faturamento emitido nem recebimento. |

O cenário de meta usa os sete dias, de segunda a domingo: **5 aulas por dia, 6 vagas por aula e 2 grupos mensalistas por dia**. Resultam **35 aulas semanais, 210 vagas na grade semanal e 14 contratos mensalistas**. As 210 vagas não representam 210 pessoas diferentes. Ocupação de matrícula também não representa presença realizada.

A meta monetária é uma **estimativa de mensalidade ao atingir a ocupação**:

- Em cada dia, 30 vagas multiplicadas pela média dos preços conhecidos das matrículas daquele dia.
- Para mensalistas, 2 grupos multiplicados pela média dos preços mensais dos grupos daquele dia.
- Sem preço conhecido no dia, usa-se a média dos contratos ativos do mesmo segmento. A interface identifica esse uso e a quantidade de referências.
- Sem preço conhecido em todo o segmento, sua meta monetária fica sem referência. O total dos dois segmentos também fica sem estimativa completa.

Preço ausente significa **a combinar**; preço explicitamente zero continua conhecido e participa da média. O subtotal conhecido mostra quantas mensalidades ainda não têm preço. As metas em reais não usam campos livres antigos de alunos, valores de reserva avulsa ou um preço presumido de turma. O cadastro de turma não oferece um preço mensal padrão para substituir os contratos.

O valor dos grupos é a mensalidade-base. Acréscimo pela quinta ocorrência, descontos, ajustes e decisões de cobrança aparecem nos lançamentos efetivos do mês, sem serem presumidos na meta recorrente. A meta em reais do Bar fica **a definir**, pois o cenário não fornece um valor para esse segmento.

## Faturamento e recebimentos

Os valores monetários da API são centavos de real. Cada bloco informa sua própria origem e referência de período; o painel não produz um total financeiro que misture as bases abaixo.

| Bloco | Origem e seleção do mês | Leitura dos valores |
| --- | --- | --- |
| Mensalidades das aulas | Cobranças `financeEntries` de matrícula, não canceladas, pela competência `month`. | Cobrado, liquidação líquida acumulada dessas cobranças até a consulta e saldo a receber. |
| Mensalistas | Cobranças de `rentalMonths`, não canceladas, pela competência `month`. | Mesmo critério de liquidação. Reservas semanais geradas pelo contrato não são somadas novamente. |
| Outras receitas de aulas | Cobranças não canceladas por vencimento no mês, fora das duas origens mensais. Inclui receitas explicitamente de Escola e cobranças ligadas a reservas `SingleLesson` ou `Trial`, mesmo quando a origem antiga é Locações. | Cobrado, liquidação líquida acumulada até a consulta e saldo. O valor combinado na reserva, sozinho, não representa cobrança ou recebimento. |
| Bar — atendimento atual | Itens aceitos/entregues pela data de aceitação; pagamentos aprovados e estornos confirmados pelas respectivas datas de confirmação. | Consumo, recebido bruto, estornos e recebido líquido são medidas distintas. Consumo não é adicionado ao recebido. |
| Bar — vendas do fluxo antigo | Eventos imutáveis `SalePaid` e `SaleRefunded`, pela data `CreatedAtUtc` de cada evento. | Recebimento positivo de `SalePaid`; estorno positivo apresentado a partir do valor negativo de `SaleRefunded`; líquido = recebimentos − estornos. |

Em aulas e mensalistas, o recebido é a liquidação das cobranças selecionadas, mesmo quando paga em outro mês. **Não é o caixa recebido dentro do mês selecionado.** Pagamentos de `BillingPayment` liquidam a cobrança original e nunca entram como uma segunda receita. Pagamentos parciais e estornos reduzem o saldo líquido; a baixa manual `Pago` é usada somente quando não há pagamento não cancelado vinculado. A interface identifica as baixas manuais para conferência.

Nos três blocos de cobrança, o saldo vencido é a parte ainda não recebida com `dueDate` anterior a `AsOfDate`. A contagem considera cobranças com saldo, inclusive parcelas parcialmente pagas; vencimento no dia da consulta ou no futuro não está atrasado. O saldo vencido já integra o saldo a receber e não deve ser somado a ele. Vencimento inválido gera um ponto de conferência.

Uma reserva cancelada não apaga uma cobrança histórica válida: o status da cobrança controla sua inclusão. Várias cobranças de uma mesma reserva podem ser legítimas. Em contrapartida, duplicidades de cobranças mensais que deveriam ser únicas são apontadas para conferência, sem escolher arbitrariamente um valor.

No Bar antigo, `SalePaid` já incorpora o desconto da venda. A unicidade de `(Name, OriginId)` e as transições de estado impedem a repetição normal do evento de pagamento ou de estorno integral. Não se filtra o recebimento histórico pelo estado atual da venda: o pagamento permanece no mês de seu evento e o estorno no mês em que foi registrado. Um mês apenas com estornos pode ter líquido negativo. Cortesia, compra, taxa, movimento de estoque e `BarPayment` não entram novamente nessa soma.

As vendas antigas ficam em bloco próprio, pois não há uma ligação de identidade que permita deduplicá-las com as comandas atuais de forma geral. Controles históricos importados, observações financeiras e extratos bancários também não são acrescentados a esses valores. Sua conferência permanece nas telas de origem.

## Consulta e conferência

O endpoint usa uma transação somente de leitura com uma visão consistente dos registros. Não emite cobranças, não atualiza provedor de pagamento, não gera reservas e não faz importação financeira. Registros inválidos, vínculos ausentes, preços a combinar e fontes sem informação suficiente geram pontos de conferência; uma falha de consulta não é apresentada como faturamento zero.

Para homologar a alteração, conferir com identidades sintéticas ou contas reais autorizadas: dono confirmado com Gestor limitado recebe acesso completo; funcionário no mesmo tipo mantém a limitação; remoção da condição de dono restaura o escopo; conta de Bar não consulta a visão dos donos; conta inativa, primeiro acesso, vínculo bloqueado e perfil incoerente não são promovidos. Não criar vendas, pagamentos ou matrículas fictícios em produção para demonstrar o painel.

Referências de implementação: [autorização de equipe](../../backend/src/LongBeach.Infrastructure/Auth/StaffAuthorization.cs), [contrato do painel](../../backend/src/LongBeach.Contracts/Overview/OwnerOverviewContracts.cs), [regras dos indicadores](../../backend/src/LongBeach.Application/Overview/OwnerOverviewRules.cs), [consulta agregada](../../backend/src/LongBeach.Infrastructure/Overview/OwnerOverviewService.cs) e [interface da visão geral](../../frontend/src/features/overview/OwnerOverviewPage.tsx).
