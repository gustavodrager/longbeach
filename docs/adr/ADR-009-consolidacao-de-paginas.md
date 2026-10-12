# ADR-009 — Consolidação das páginas e navegação

Data: 2026-10-10. Status: implementado na cópia local para revisão, sem publicação.

## Critério

Uma página permanece quando resolve uma tarefa distinta, conserva histórico ou contém operações que não existem no destino proposto. Ter aparência semelhante não basta para excluir. Nenhum registro, endpoint, lançamento ou histórico é removido nesta etapa. A autorização continua aplicada pelas páginas e pela API, independentemente da presença do item no menu.

## Inventário e decisão

| Área / páginas | Decisão e motivo |
| --- | --- |
| Visão geral | Manter resumo da gestão; Agenda mantém o resumo específico de disponibilidade. |
| Agenda, ficha de reserva, reserva recorrente | Manter; calendário, edição individual e criação de série são tarefas distintas. Recorrência genérica não vira grupo mensalista. |
| Quadras | Consolidar em Agenda → Funcionamento e preços, `/agenda/funcionamento`; seleção da única quadra permanece automática. |
| Solicitações de clientes | Manter em Agenda; decisão da equipe e histórico de solicitações. |
| Mensalistas e ficha do grupo | Manter; acordo, participantes, encontros e competências. |
| Turmas, ficha da turma, alunos e ficha, matrículas, presenças | Manter em Aulas; inscrição, pessoa, grade e chamada possuem regras diferentes. Ficha da turma tem um endereço canônico. |
| Recebimentos e conciliação PagBank | Manter em Financeiro; cobrança e conciliação ficam relacionadas. |
| Lançamentos e ficha | Manter; receitas/despesas operacionais não se confundem com execução de pagamento. |
| Controle mensal e histórico financeiro | Manter; consulta por competência e proveniência dos controles importados. |
| Vender, comandas e ficha, pedidos, receber, comprovante, meu caixa | Manter no atendimento do bar, com permissões existentes. |
| Resumo do bar, detalhes dos indicadores, registros de origem | Manter; análise atual baseada em comandas com rastreabilidade. |
| Produtos, fichas técnicas, estoque, inventário, perdas, compras, caixas da equipe | Manter na gestão do bar; necessários para catálogo, preparo, reposição e supervisão. |
| Vendas históricas e conciliação do bar | Manter consultas e ações já existentes do fluxo anterior; renomear Vendas para explicitar a origem e oferecer link às comandas atuais. |
| Antigos componentes BarPosPage e BarDashboardPage | Retirar código duplicado sem rotas ativas. Atendimento e resumo atual já os substituem. APIs de vendas antigas continuam disponíveis às rotinas históricas. |
| Equipe e ficha, acesso dos professores | Manter; relacionar Acesso dos professores a Equipe no menu. |
| Materiais da arena e ficha | Mover endereço principal para Administração → Materiais, `/administracao/materiais`, distinguindo de `/bar/estoque`. |
| Projetos e ficha, manutenção e ficha | Manter em Administração; conservam tarefas, responsáveis, custos e cuidados da arena. Não há evidência para apagar esses registros ou funções. |
| Importações | Manter restrito à gestão para migração e rastreabilidade. |
| Minha área: início, agenda, solicitar, ajuda, bar, pagamentos, perfil, segurança | Manter; experiência própria do cliente sem menu administrativo. |
| Professor: início, turmas, presenças, chamada | Manter; apenas turmas e encontros permitidos pelo vínculo. |
| Login, primeiro acesso, conta | Manter autenticação e segurança. |
| Cliente por QR (`/cliente`) | Manter; acesso à comanda por credencial temporária, distinto da conta pessoal. Não redirecionar ou alterar o fragmento com token. |
| Protótipo (`/prototipo/*`) | Manter separado da operação; demonstração não substitui rotas autenticadas. |
| Endereço inexistente | Mostrar orientação e retorno à área do perfil, sem redirecionamento silencioso para a gestão. |

## Compatibilidade

- `/quadras` → `/agenda/funcionamento`.
- `/estoque` e `/estoque/:itemId` → `/administracao/materiais` e respectiva ficha.
- `/escola/:classId` → `/escola/turmas/:classId`; matrículas e presenças conservam rotas específicas.
- `/minhas-contas` → `/minha-area/pagamentos`.
- Redirecionamentos substituem a entrada no histórico, conservando filtros, competência, âncora e contexto de retorno. Os identificadores são codificados como um segmento de URL. Os links internos passam a usar os destinos canônicos.
- `/bar` escolhe um destino autorizado pelo perfil, em vez de enviar supervisores/financeiro/estoque indiscriminadamente para Vender.

## Menu e validação

Os sete grupos principais da gestão permanecem. O menu móvel passa a incluir também destinos relacionados: fichas técnicas, inventário, perdas, conciliação e acesso de professores. Breadcrumb e seção ativa acompanham os destinos profundos. A chamada, o caixa e o portal mantêm suas navegações próprias.

Testes cobrem redirecionamentos com filtros/âncora/retorno, botão Voltar, destinos por perfil, rotas profundas, ausência de duplicação dos destinos e página inexistente. A cobertura do caixa anterior foi retirada junto com o componente sem rota; os testes do atendimento atual continuam cobrindo estoque esgotado, quantidades, dinheiro, cartão, Pix, falhas e idempotência. Builds do frontend e API exigidos antes da revisão.

Limites: não houve migração de dados nem alteração de autorização no servidor. A próxima etapa recomendada é homologar os fluxos completos por perfil com a gestão; Google e PagBank ainda exigem configuração própria de homologação. Publicação e envio ao repositório dependem de aprovação específica.
