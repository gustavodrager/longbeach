# Controle mensal revisado

A composição mensal complementa as importações: quando o responsável confirma totais ou manda usar uma referência para categorias ausentes, uma revisão preserva a decisão sem inventar pagamentos individuais. O histórico importado permanece disponível com sua proveniência original.

Somente Owner pode ler e salvar `/api/v1/financial-history/monthly-controls`. Cada competência guarda até cem linhas de receitas/despesas, valores em centavos, classificação, centro de custo, base informada/estimada, competência de referência e origem. Um valor zero informado é válido; estimativas exigem referência. A revisão precisa identificar receitas e despesas.

Persistência em `operational_records`, tipo privado `monthlyFinanceControls`, sem migration. Esse tipo não integra os endpoints genéricos. Gravação serializada pelo lock operacional existente, versão otimista, reaplicação idêntica sem duplicação e auditoria antes/depois. Nenhum saldo bancário, pagamento, cobrança ou estoque é criado.

O painel usa a revisão mais recente quando sua competência não é anterior ao consolidado importado, nem futura. Mostra receitas, despesas positivas, resultado e parcela estimada. O saldo bancário continua independente. As fontes brutas ficam em uma seção recolhida, evitando apresentar o consolidado antigo como fechamento atualizado.

A tela Financeiro → Controle mensal permite conferir um arquivo de revisão antes de salvar, editar valores e consultar a origem. O painel de edição conserva a versão capturada e mantém os dados preenchidos diante de conflito. Reabrir um link de edição restaura a ficha. A seleção da competência fica na URL.

Os serviços da quadra têm preço avulso, preço/duração do pacote de sábado ou domingo e limite de saída opcionais. Valores são protegidos pelas permissões financeiras. Cadastrar um preço não altera automaticamente os dias e horários de funcionamento nem cria uma reserva. A janela inicial do fim de semana precisa ser definida antes de liberá-lo na agenda.

Validação: regras de preços/horários/permissões, revisão idempotente e concorrente com auditoria no PostgreSQL, bloqueio da equipe, totais estimados e edição por link. Conferência visual em 360, 390, 768 e 1440 px com dados fictícios. No ambiente real, salvar apenas revisões e preços autorizados, reler os valores e confirmar o painel sem gerar movimentações de teste.

Rollback: conservar registros e auditorias; restaurar API e web anteriores retorna à visão de histórico importado, que não conhece a composição revisada. Preferir corrigir para frente. Referências privadas e pacotes de dados não devem entrar no Git.
