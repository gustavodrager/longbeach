# ADR-008 — Unidades de negócio Bar e Quadra

Data: 08/10/2026. Decisão arquitetural aceita pelo proprietário nesta conversa; implementação incremental. Este documento não autoriza publicação de artefatos ainda não revisados.

## Decisão

LongBeach é um estabelecimento com duas unidades gerenciais: Bar (`bar`) e Quadra (`quadra`). Escola e Locações são atividades da Quadra. Administração e custos compartilhados são suporte ao estabelecimento, não uma terceira unidade de negócio. Empresa/CNPJ e política de pessoal compartilhado ainda precisam de confirmação. A destinação das vendas e dos Pix foi confirmada pelo proprietário em 14/10/2026 conforme a regra abaixo; conta bancária continua separada de unidade de negócio.

Manter aplicação, autenticação e banco próprios do LongBeach no monólito modular. Bar conserva comandas, consumo, pagamentos e caixa; Quadra conserva agenda, mensalistas e Escola. Pessoas, catálogo básico, infraestrutura financeira, auditoria e mecanismo de estoque podem ser compartilhados, com vínculo explícito à unidade. Preservar ADR-001, ADR-003, ADR-004 e ADR-006.

## Conceitos separados

- Unidade de negócio: responsável pelo resultado (Bar ou Quadra).
- Atividade/centro de custo: explica a receita ou despesa (Escola, Locações, cozinha, administração).
- Local físico: indica guarda/utilização de bens; não determina propriedade.
- Conta financeira/caixa: indica onde o dinheiro transita; não determina a unidade da receita.
- Pessoa: cadastro único, com vínculos de atuação por unidade e período; usuário de acesso é um conceito separado.

Uma locação e o consumo de bebidas do mesmo cliente conservam suas unidades e origens. Pagamentos, liquidações e controles mensais não geram receitas adicionais quando representam a mesma operação. Compra, entrada de estoque e pagamento ao fornecedor são eventos distintos e vinculados.

## Primeiro incremento implementado

Lançamentos `financeEntries` e linhas do controle mensal aceitam os campos opcionais `allocationScope` e `businessUnitId`. Escopos: `Unit` exige `bar` ou `quadra`; `Shared` e `Unclassified` exigem unidade nula. Compartilhado continua sem rateio. Não existe distribuição presumida de valores.

Origem/área histórica é preservada. Bar corresponde a Bar; Escola e Locações correspondem a Quadra. Arena sem classificação explícita permanece a classificar. A leitura da interface deriva essas correspondências sem regravar históricos. Ao revisar uma linha, o formulário grava a classificação explícita. A API rejeita unidades desconhecidas e contradições com as origens determinadas. Clientes anteriores que omitam os campos preservam uma classificação já revisada; redefinir exige um escopo explícito.

O financeiro operacional filtra lançamentos e seus indicadores pela destinação. O controle mensal filtra as linhas, preservando os indicadores do mês completo e avisando essa diferença. Indicadores específicos do Bar conservam sua fonte e não são somados automaticamente aos lançamentos operacionais. Não se apresenta resultado completo por unidade ou saldo bancário deduzido desses filtros.

Não há migration nem atualização em massa neste incremento: o envelope JSON versionado aceita os campos aditivos. São mantidos controles de concorrência, autorização e auditoria existentes. O catálogo inicial de duas unidades é fechado; não há cadastro administrativo de novas unidades.

## Próximos incrementos e critérios de aceite

1. **Financeiro e acesso por unidade:** vincular documentos e eventos à unidade na origem; introduzir concessões de acesso por unidade e permissões separadas para dados remuneratórios. O backend deve rejeitar leitura/escrita fora do escopo, independentemente dos filtros da interface. Este incremento inicial ainda usa permissões gerais existentes, sem isolamento por unidade.
2. **Custos compartilhados:** registrar despesa uma vez, com parcelas de rateio, critério, período, responsável e auditoria. A soma das parcelas deve ser exatamente o valor distribuído, com arredondamento determinístico. Alterações futuras não recalculam meses fechados. O consolidado deve incluir custos comuns não distribuídos sem duplicar os já alocados.
3. **Equipe:** cadastro único de pessoa; vínculos com unidade, função, vigência e critério de custo. Escala/trabalho realizado, acordo e pagamento devem ser registros distintos. Não duplicar funcionários nem criar despesas apenas por cadastrar um acordo.
4. **Estoque e compras:** evoluir o núcleo hoje ligado a BarProduct para catálogo comum, preservando IDs e histórico. Saldo por produto, local e unidade proprietária; transferências com saída/entrada vinculadas e consumo por unidade. Equipamentos duráveis exigem custódia/manutenção além de quantidade. Conciliar saldo e valor antes/depois; não converter cadastros da arena em saldos reais sem inventário aprovado.
5. **Gestão:** visões Bar, Quadra e consolidado com resultado direto e após rateio, recebimentos, obrigações, estoque e custo de pessoal. Identificar estimativas e valores não classificados. A soma das partes deve reconciliar com o consolidado e manter separadas as fontes sobrepostas do histórico.

## Transição e reversibilidade

Publicar backend compatível antes do frontend. Conferir edição, filtros, omissão de campos por cliente anterior, rejeição de classificações contraditórias e permissões. Não reclassificar Arena em lote nem ativar pagamentos/EDI nesta entrega. Para interromper a nova interface, retornar apenas a web e manter o backend compatível: voltar a uma API anterior perde a proteção contra apagamento dos novos campos por clientes antigos.

Primeiro incremento publicado em 08/10/2026 após autorização explícita: API e web no commit `78f9c81`, validado pela CI `37856181278`. Produção e evidências permanecem identificadas no manifesto de release. Pendências de acesso à auditoria real não são resolvidas pela classificação gerencial.

## Regra de recebimentos confirmada em 14/10/2026

- Vendas feitas na maquininha PagBank ou no PagVendas pertencem ao **Bar**, inclusive quando a venda é paga com Pix.
- Aulas, mensalidades, locações e outros serviços da Quadra pagos por Pix diretamente nas contas PagBank ou C6 pertencem à **Quadra**.
- Conta de recebimento e unidade são conceitos distintos: o nome PagBank/C6 ou o meio Pix, isoladamente, não identifica o serviço vendido. Transferência entre contas, aporte, liquidação de venda já registrada, saldo e estorno não são novas receitas.

Lançamentos operacionais a receber passam a aceitar `receiptSource` (`PagBankTerminal`, `PagVendas`, `CourtPix`) e `receivingAccount` (`PagBank`, `C6`). A origem identificada fixa a unidade correspondente; Pix da Quadra exige a conta. A API rejeita contradições com a origem/unidade e esses metadados em contas a pagar. Clientes anteriores preservam campos omitidos; nulo explícito limpa o metadado. A informação não confirma pagamento nem executa cobrança. Não há integração bancária C6 ativada por este cadastro.

No histórico, a classificação é derivada na leitura: `pagvendas-vendas` e vendas brutas do Bar no consolidado são Bar; `alunos`, `mensalistas` e `aulas` são Quadra. Extratos, saldos e resumos genéricos permanecem sem unidade atribuída. Payload, hash, célula e fingerprint das importações permanecem inalterados; nenhum valor é somado novamente nem regravado em lote. Documentos EDI continuam sem classificação automática até haver identificação confiável do canal e conciliação. A regra comercial de uma venda de terminal é Bar, mas o provedor sozinho não comprova que o evento veio de terminal.

Incremento sem migration, alteração de credenciais ou ativação de pagamentos. Os eventos internos de cobrança continuam vinculados à unidade da conta de origem. Recebimentos vinculados a reservas, matrículas ou mensalistas rejeitam destinação Bar/compartilhada; contas da Quadra já vinculadas preservam sua classificação. Candidatas a cobrança, pagamento e recorrência recusam lançamentos incompatíveis com Quadra. A classificação histórica não constitui confirmação bancária nem resultado consolidado por unidade.

Validação local: interface completa (328 testes), regras afetadas (113 testes unitários), persistência/histórico/auditoria e fluxos de cobrança/recorrência em PostgreSQL 17 descartável. Builds da API e web aprovados. Nenhum dado bancário real foi alterado.

Esta revisão de 14/10/2026 está implementada e validada localmente; ainda não foi promovida para homologação ou produção. A publicação deve preservar as demais alterações entregues por outras frentes desde a versão anterior.
