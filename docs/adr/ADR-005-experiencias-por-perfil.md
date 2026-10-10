# ADR-005 — Experiências e limites por perfil

Status: implementação local para revisão; publicação não autorizada.
Data: 2026-10-10.

A gestão aprovou a primeira etapa de organização por perfil: gestores e administradores com acesso completo, professores apenas às próprias turmas, clientes aos próprios registros, atendentes às funções de atendimento. Cadastro público Google e mudanças nos fluxos comerciais ficam para etapas posteriores.

## Decisão

- Owner, Administrator e Manager recebem todas as permissões catalogadas. Histórico e importações usam a política Management; Owner permanece uma identidade distinta para comandos de bootstrap.
- Permissões efetivas são calculadas no login, na renovação e na autenticação das requisições. Um token anterior com permissões amplas de Teacher ou Student não recupera acesso administrativo. Perfis acumulados recebem a união dos limites correspondentes, preservando permissões explicitamente atribuídas. Contas personalizadas sem papel catalogado preservam suas permissões explícitas.
- Teacher usa endpoints próprios, com projeções mínimas de turma e aluno. Não usa os endpoints administrativos de alunos, matrículas, presença ou agenda geral.
- A gestão relaciona a conta Teacher ao cadastro da equipe em Administração → Acesso dos professores. O vínculo explícito é armazenado como registro operacional teacherLinks, com auditoria existente, sem migration. Uma pessoa da equipe não pode ser vinculada a duas contas de professor. Remover o vínculo bloqueia novas consultas e alterações imediatamente.
- Presença exige vínculo atual, turma atribuída, matrícula válida na data, dia da grade e início da turma. A gravação só ocorre em turma ativa e até a data atual de Brasília, com versão otimista e a mesma trava transacional das operações da arena. O DTO não permite alterar turma, professor, matrícula ou dados financeiros.
- O professor consulta os dados cadastrais atuais, não um histórico imutável de participantes. A grade apresentada não promete encontros avulsos/experimentais ainda não integrados à área do professor.
- BarOperator preserva catálogo de atendimento, comandas, pedidos e próprio caixa. Movimentos de estoque, supervisão e finanças exigem outros papéis autorizados. Os controles já existentes por operador e por comanda permanecem ativos.
- O portal pessoal e seus endpoints continuam delimitados pela identidade autenticada. Minha área e Área de trabalho são navegações da mesma conta, sem trocar permissões.

## Validação e promoção

Validar acesso direto às URLs e à API, contas com papéis acumulados, tokens anteriores, vínculo ausente/revogado, turma de outro professor, aluno fora da matrícula, datas inválidas/futuras, versões concorrentes, foco e layouts mobile/desktop. Homologar com contas fictícias e banco local isolado. Não promover nem alterar contas de produção sem aprovação.

O catálogo de papéis no banco pode ainda conter permissões antigas; o limite efetivo do servidor as restringe. A promoção deve incluir API e frontend da mesma versão, confirmar os vínculos com a gestão e manter artefato anterior para retorno. Rollback de autorização exige reavaliação explícita, pois pode reintroduzir limites antigos.
