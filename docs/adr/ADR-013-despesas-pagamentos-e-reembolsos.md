# ADR-013 — Despesas, pagamentos da equipe e reembolsos

Data: 21/10/2026. Implementação local; publicação é uma etapa separada.

## Decisão

Reunir as obrigações a pagar em Financeiro → Despesas e pagamentos, preservando a estrutura independente do Long Beach OS. A tela usa os próprios `financeEntries`: uma compra paga pessoalmente por um sócio continua sendo um único gasto, cujo credor passa a ser o sócio. Cada devolução reduz o saldo dessa mesma obrigação.

A visão inicial mostra pendências de todas as datas, resumo global, vencidos primeiro e saldo restante. O valor devido aos sócios já integra o total em aberto. Busca, tipo e situação filtram a lista, sem redefinir o resumo global. Registros concluídos e cancelados conservam sua identificação e histórico.

## Informações de cadastro

- Despesa avulsa: descrição, valor e situação. A data começa em hoje, na zona `America/Sao_Paulo`.
- Equipe: pessoa, referência mensal ou dia/turno e valor. O acordo atual fornece uma sugestão editável; cadastrar uma pessoa não gera obrigação automaticamente. Pessoa/mês e pessoa/dia/turno possuem proteção contra duplicidade.
- A pagar: vencimento. Pago pela empresa: data do pagamento. Pago por sócio: identificação de quem usou recursos pessoais.
- Unidade é reaproveitada da compra ou informada no gasto avulso. Compartilhado e a classificar continuam sem rateio presumido.
- Datas, referência de documento, observação e detalhes do meio de pagamento ficam em contexto secundário. Comprovantes podem ser anexados depois que o lançamento existe.

Sócios têm um catálogo financeiro simples de nomes. Esse catálogo não concede acesso ao sistema e não transforma o usuário que operou uma conta empresarial em credor de reembolso.

## Persistência e invariantes

O endpoint dedicado `/api/v1/expenses` registra metadados versionados em `financeEntries`, operações imutáveis em registros privados de pagamento e o catálogo privado de sócios. Clientes genéricos anteriores não podem criar metadados reservados nem sobrescrever uma despesa gerenciada. As leituras antigas permanecem compatíveis.

Toda baixa verifica valor, saldo, data e versão sob o mesmo bloqueio transacional das escritas operacionais existentes. Uma chave de operação repetida com os mesmos dados devolve o resultado já registrado; reutilizá-la com outros dados gera conflito. O valor original, os pagamentos e o saldo permanecem distintos. Pagamentos e auditoria são gravados na mesma transação.

Uma conta a pagar anterior passa a ser gerenciada na primeira baixa pelo novo fluxo. Recebíveis, cobranças, pagamentos dos clientes, Bar e caixa físico mantêm seus próprios fluxos. A posição financeira inicial passa a considerar as baixas parciais das despesas; ausência de prazo não significa vencimento.

A métrica Despesas pagas da Visão geral considera as baixas efetivas no período e os lançamentos anteriores integralmente pagos ainda sem histórico gerenciado. A baixa final de uma conta parcialmente paga não reapresenta seu valor original inteiro como saída na data da conclusão.

Compras do Bar fornecem descrição, total, data e unidade diretamente do registro de origem. A criação rejeita uma segunda obrigação ativa para a mesma compra e valida a origem no servidor. Vincular uma compra não recebe produtos nem repete movimentos de estoque. Cancelar o saldo de entrega de uma compra exige conferência financeira separada: entregas, pagamentos e eventuais devoluções de dinheiro são fatos distintos.

Cancelamento por erro exige motivo e versão, preserva o histórico e se limita a pendências ainda sem pagamento nem adiantamento de sócio. Obrigações já movimentadas exigem tratamento específico, preservando os acertos registrados.

## Comprovantes e acesso

PDF, JPEG e PNG são armazenados em tabela própria no PostgreSQL exclusivo do Long Beach OS, com limite de 2.000.000 bytes, assinatura do conteúdo, hash e chave de operação. Leitura e download exigem `finance:read`; upload também exige `finance:write`. O vínculo despesa/arquivo é validado no servidor. Dados binários e nome do arquivo não são gravados na auditoria.

A migration `20261021154910_ExpenseAttachments` é aditiva. Não cria obrigações nem altera compras, dados históricos ou saldos bancários.

## Limites e transição

O registro é uma confirmação operacional: não inicia transferência bancária nem altera o extrato C6, o caixa físico ou a carteira do provedor. Controles mensais revisados e históricos importados não são somados automaticamente à nova lista.

Compras antigas e referências textuais não são convertidas em reembolsos presumidos. A gestão vincula explicitamente as compras necessárias e identifica quem realmente adiantou recursos.

Publicação exige migration por job controlado, backend compatível antes da web e conferência de autorização e saldo no ambiente de homologação. Preferir retorno apenas da web, preservando a API com proteção dos novos registros, a tabela de comprovantes e as auditorias. Não retornar a uma API antiga que permita sobrescrever os metadados novos.
