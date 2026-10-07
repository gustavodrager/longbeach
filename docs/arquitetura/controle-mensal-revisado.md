# Controle mensal revisado

A composição mensal complementa as importações: quando o responsável confirma totais ou manda usar uma referência para categorias ausentes, uma revisão preserva a decisão sem inventar pagamentos individuais. O histórico importado permanece disponível com sua proveniência original.

Somente Owner pode ler e salvar `/api/v1/financial-history/monthly-controls`. Cada competência guarda até cem linhas de receitas/despesas, valores em centavos, classificação, centro de custo, base informada/estimada, competência de referência e origem. Um valor zero informado é válido; estimativas exigem referência. A revisão precisa identificar receitas e despesas.

Persistência em `operational_records`, tipo privado `monthlyFinanceControls`, sem migration. Esse tipo não integra os endpoints genéricos. Gravação serializada pelo lock operacional existente, versão otimista, reaplicação idêntica sem duplicação e auditoria antes/depois. Nenhum saldo bancário, pagamento, cobrança ou estoque é criado.

O painel usa a revisão mais recente quando sua competência não é anterior ao consolidado importado, nem futura. Mostra receitas, despesas positivas, resultado e parcela estimada. O saldo bancário continua independente. As fontes brutas ficam em uma seção recolhida, evitando apresentar o consolidado antigo como fechamento atualizado.

A tela Financeiro → Controle mensal permite conferir um arquivo de revisão antes de salvar, editar valores e consultar a origem. O painel de edição conserva a versão capturada e mantém os dados preenchidos diante de conflito. Reabrir um link de edição restaura a ficha. A seleção da competência fica na URL.

Os serviços da quadra têm preço avulso, preço/duração do pacote de sábado ou domingo e limite de saída opcionais. Valores são protegidos pelas permissões financeiras. Cadastrar um preço não altera automaticamente os dias e horários de funcionamento nem cria uma reserva. A janela inicial do fim de semana precisa ser definida antes de liberá-lo na agenda.

Validação: regras de preços/horários/permissões, revisão idempotente e concorrente com auditoria no PostgreSQL, bloqueio da equipe, totais estimados e edição por link. Conferência visual em 360, 390, 768 e 1440 px com dados fictícios. No ambiente real, salvar apenas revisões e preços autorizados, reler os valores e confirmar o painel sem gerar movimentações de teste.

Rollback: conservar registros e auditorias; restaurar API e web anteriores retorna à visão de histórico importado, que não conhece a composição revisada. Preferir corrigir para frente. Referências privadas e pacotes de dados não devem entrar no Git.

## Conferência de produção — 2026-10-06

O incremento foi incorporado à publicação conjunta `12281ec8a29f2fff1bf6dee7b0104393129e85f1`, CI `37530868604` aprovado. API `d61045f2-4e33-495f-a703-a654a35cb429` e web `023e0ca8-cb91-473c-9bb9-488858422403`, ambas SUCCESS. O snapshot final corresponde ao estado live, sem drift.

No Chrome autenticado, após aceitar a atualização da PWA, foi aplicada a revisão mensal autorizada de 28 linhas. A releitura após recarregar confirmou as linhas e os totais; o dashboard passou a usar a composição revisada, conservando a fonte/data do saldo bancário. Serviços e limite de saída da quadra foram gravados pelo formulário oficial e conferidos no resumo. Não foram criados pagamentos, reservas ou movimentos de teste em produção. Capturas e fontes financeiras permanecem em armazenamento local privado.

O cabeçalho compacto e a visão financeira foram conferidos em produção em 360, 390, 768 e 1440 px sem rolagem horizontal da página. Edição com conflito, link direto, autorização e persistência foram verificadas nos testes locais/CI. O fluxo de edição no celular também foi exercitado com dados fictícios.

A publicação conjunta inclui migrations do módulo de pagamentos. Qualquer rollback da API deve obedecer também ao runbook de pagamentos unificados, preservando registros e reconciliação; não basta aplicar a orientação isolada deste incremento.

## Separação de despesas por tipo

O dashboard revisado inclui `expensesByType` com somas independentes de `Fixa`, `Variável`, `Parcela` e `Acerto`; despesas com outra classificação permanecem em `otherCents`. Somente linhas de direção `Despesa` entram nesses totais. A soma dos cinco grupos reconcilia com `ExpenseCents`, sem mudar o resultado mensal, registros, origem ou valores. Consolidados históricos sem composição retornam `null`, sem classificação presumida.

Na interface, os grupos são links compactos para o controle da mesma competência, filtrado por `grupo=fixas|variaveis|parcelas|acertos|outras`. Receitas e todos os valores continuam acessíveis. O grupo permanece ao editar, salvar e trocar a competência; o cadastro inicia com a classificação selecionada. Valores zero continuam visíveis. A indicação de estimativa aparece somente quando há linhas estimadas. Nenhuma migration ou reclassificação em lote é necessária.
