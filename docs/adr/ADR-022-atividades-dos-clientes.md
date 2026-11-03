# ADR-022 — Atividades dos clientes

Data: 03/11/2026. Estado: implementado localmente, aguardando revisão e autorização de publicação.

Complementa [cadastro único](ADR-018-cadastro-unico-clientes.md) e [conta individual](ADR-021-conta-individual-clientes.md).

## Decisão

Cada pessoa conserva uma ficha de Cliente e sua conta individual. Aluno, Mensalista, Avulso e Bar são vínculos acumuláveis, não perfis de acesso. O proprietário confirmou que todos os integrantes identificados de um grupo são mensalistas e podem também ser alunos. Avulso abrange quadra e aula pontual.

| Vínculo | Identificação |
|---|---|
| Aluno | Ficha escolar vinculada, preservando matrículas e histórico existentes. |
| Mensalista | Integrante identificado de um grupo de locação semanal com acordo mensal; responsável e suplente continuam separados. |
| Avulso | Locação pontual identificada ou aula explicitamente cadastrada como avulsa. |
| Bar | Comanda ou venda identificada. Pode coexistir com os demais vínculos. |

Uma ficha nova pode ficar sem atividades. Ausência de aulas ou reservas não constitui erro nem torna a pessoa cliente de bar automaticamente. O cadastro público não pergunta atividades e não cria matrícula, grupo, reserva, cobrança ou responsabilidade financeira.

As etiquetas mostram registros vinculados, incluindo histórico; não afirmam matrícula, contrato ou cobrança atualmente ativos. Não se deduzem atividades de nome, contato, origem, Google, senha ou frequência de visitas. Os critérios anteriores de Aluno, Mensalista e Bar são preservados.

`SomenteBar` é somente um filtro: exige Bar e ausência de qualquer vínculo identificado de aluno, integrante mensalista ou reserva na família canônica. Experimental, reposição e reserva cancelada também impedem essa seleção conservadora, embora não gerem a etiqueta Avulso. O filtro descreve os registros disponíveis, não uma inferência sobre o comportamento da pessoa.

## Aula avulsa e agenda

Reaproveitar reservas com `activityKind=SingleLesson`, cliente selecionado explicitamente e professor ativo. Não criar outra turma, matrícula ou agenda. A nova atividade tem data própria, sem grupo mensalista, lote semanal ou bloqueio. Validar disponibilidade de quadra e professor no servidor e na interface; cancelar uma aula existente continua possível se o professor foi inativado.

Locação pontual e SingleLesson podem ser alteradas explicitamente na reserva. Experimental, reposição de turma regular e encontro mensalista não são convertidos automaticamente em avulso ou locação. Preservar as marcações e a proveniência desses encontros, inclusive em acesso direto à API.

Aulas avulsas aparecem na agenda geral e de Aulas, nas visões dia, lista e semana. Contam como tempo de aula, mantendo a quadra ocupada em todas as visões. A área do Professor usa o vínculo de professor já existente, com isolamento preservado.

Uma nova cobrança escolhida pela gestão com origem nessa aula começa em Escola. Isso não cria cobrança automaticamente, não confirma recebimento e não altera lançamentos anteriores. A consulta pela reserva mantém visíveis cobranças de diferentes origens históricas.

## Interface e acesso

- Equipe: nome e telefone no cadastro; e-mail em Mais dados. Ficha com Cadastro e Atividades, acesso e administração recolhidos.
- Público: nome e telefone, Continuar, método de entrada disponível. Validar o contato antes de abrir o Google. Não exigir a escolha de tipo de cliente.
- Bar: acesso pelo responsável fica opcional e recolhido; nome escolhido e confirmação das consequências continuam visíveis. Identificar um cliente não define quem paga.
- Manter erros, conflitos, confirmação de identidade, recuperação de comandos incertos, responsabilidade financeira e revogação. Explicações genéricas repetidas saem da tela.

Google, senha, convites, dependentes, perfil de login e autorizações continuam com as regras do ADR-021. Não habilitar autocadastro local de produção nesta alteração.

## Persistência e entrega

Não há migration nem reclassificação em massa. Reaproveitar os vínculos e o documento de reserva existentes; acrescentar os filtros `Avulso` e `SomenteBar`. Consultar somente os campos necessários à classificação, preservando aliases, remoções explícitas e registros ainda na transação.

A entrega exige interface e API compatíveis, com schema 32 preservado. A autorização anterior de publicação foi concluída e não autoriza esta versão. Validação e limites estão no [relatório da revisão](../revisoes/cadastro-cliente-clean-2026-11-03.md).
