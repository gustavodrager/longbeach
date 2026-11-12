# Exclusão de turmas com preservação do histórico

## Decisão de produto

Em 12/11/2026, o proprietário autorizou permitir a exclusão de turmas e manter seu histórico. A exclusão passa a retirar a turma da operação, preservando seu registro, os vínculos dos alunos, as presenças e o financeiro.

Esta decisão substitui o bloqueio genérico por alunos ou histórico descrito em `docs/revisoes/exclusao-de-turmas-2026-11-02.md`. Esse documento anterior permanece como registro da implementação daquele momento.

## Comportamento definido

- O Gestor continua sendo o perfil autorizado a excluir turmas.
- A confirmação informa que o histórico será preservado e que as matrículas ativas daquela turma serão encerradas.
- Turmas excluídas saem da listagem operacional padrão e ficam disponíveis no filtro de histórico de exclusões, com ficha para consulta.
- A exclusão mantém os identificadores originais da turma, dos alunos e dos demais registros. O cadastro do aluno e suas matrículas em outras turmas permanecem independentes.
- A ficha da turma excluída e as matrículas encerradas por essa operação ficam somente para consulta; uma ficha aberta anteriormente não pode reativá-las ou sobrescrever o histórico.
- As presenças, cobranças, pagamentos e pendências anteriores continuam preservados. A exclusão não representa quitação, estorno ou cancelamento automático de pagamentos.
- Novas matrículas, novas atividades operacionais e novas adesões de cobrança recorrente não podem usar a turma excluída.

## Registro da exclusão

A turma permanece em `OperationalRecord`, com o conteúdo anterior e os seguintes metadados controlados pelo servidor:

| Campo | Finalidade |
| --- | --- |
| `deletedAt` | Instante UTC da exclusão. |
| `deletedBy` | Identificador do responsável autenticado. |
| `deletedEffectiveDate` | Data local da exclusão em `America/Sao_Paulo`. |
| `deletedPreviousStatus` | Situação anterior à exclusão. |
| `status` | Passa a `Encerrada`. |
| `version` | Avança para impedir gravações com uma versão anterior. |

O cliente não pode criar, alterar ou remover esses marcadores por gravação comum. A auditoria identifica o responsável e a operação sem copiar dados pessoais dos alunos para seus metadados.

Vínculos legados em `studentIds` são preservados. A exclusão não depende de convertê-los ou removê-los previamente.

## Matrículas e agenda

As matrículas ativas são encerradas na mesma transação da turma. A data final é `max(startDate, deletedEffectiveDate)`, preservando a data original de início. Matrículas com início posterior à data de exclusão recebem `cancelledBeforeStart`, para registrar que não chegaram a entrar em vigência. Esse marcador deve impedir que a data final ajustada crie um dia fictício de elegibilidade.

As matrículas já encerradas permanecem como estavam. Os registros alterados pela exclusão recebem nova versão e identificação da origem do encerramento.

A agenda preserva a projeção histórica de turmas que estavam ativas antes da exclusão. São mantidos os dias anteriores e, no próprio dia da exclusão, os horários cujo início ocorreu antes de `deletedAt`. Horários que ainda não começaram deixam de ocupar a agenda. A situação anterior evita reconstruir artificialmente uma grade de turma que já estava pausada ou encerrada.

Essa projeção de agenda não substitui os registros de presença: presença e falta continuam sendo fatos registrados separadamente.

Reservas são tratadas apenas quando há vínculo explícito com a turma. Uma aula experimental ou avulsa independente não passa a pertencer à turma por coincidência de professor, quadra ou horário. Os registros relacionados que forem alterados permanecem preservados e retornam na resposta da operação.

## Cobranças recorrentes

Histórico financeiro e matrículas antigas deixam de ser motivo genérico para impedir a exclusão. Existe uma proteção específica para assinaturas de cobrança recorrente ainda não finalizadas:

- Uma assinatura de matrícula em estado não terminal impede a exclusão, com motivo específico para que sua cobrança automática seja resolvida antes.
- `Creating`, inclusive uma criação com resultado incerto, e `CancelPending` continuam sendo estados não terminais.
- O critério existente de estado terminal considera `CANCELED`, `EXPIRED` e `Rejected`.
- A exclusão de turma não envia cancelamento ao provedor financeiro em nome do pagador.
- A criação de novas assinaturas deve revalidar a matrícula e a turma sob a mesma trava da operação, evitando uma adesão concorrente após a exclusão.
- Contas, faturas e pagamentos anteriores continuam disponíveis para consulta e tratamento financeiro.

## Contrato de API e integridade

- `DELETE /api/v1/operations/classes/{id}?version=N` preserva o registro e responde `200` com `{ class, enrollments, reservations }`.
- Cada objeto da resposta respeita as mesmas projeções de acesso e visibilidade financeira das consultas existentes.
- `GET /api/v1/operations/classes` omite as turmas excluídas por padrão.
- `GET /api/v1/operations/classes?includeDeleted=true` inclui o histórico, respeitando as permissões já aplicáveis à consulta.
- A interface usa a consulta que inclui o histórico para conservar nomes e vínculos, aplicando o filtro operacional na apresentação.
- A versão explícita, a transação e a trava compartilhada da arena continuam protegendo a operação contra gravações concorrentes.
- O estado local da interface só muda após a resposta válida do servidor; a resposta incorpora a turma e os vínculos atualizados, em vez de apagar o cadastro da memória.
- Uma resposta pertencente a uma sessão anterior não altera o estado de outra sessão.

## Escopo e compatibilidade

A alteração usa os registros JSON e a infraestrutura de auditoria existentes. Não depende de apagar dados, executar uma migração de registros legados ou alterar os perfis de acesso.

As consultas de agenda, o portal do cliente, a área do professor e a automação de mensagens precisam respeitar o corte da turma. Os históricos de solicitações e de mensagens permanecem registrados. Pedidos futuros baseados em uma ocorrência retirada da agenda devem ser revalidados antes de sua confirmação.

## Ordem de publicação

Publicar a API antes da interface. A interface nova depende do retorno `200` com os registros preservados; a API anterior devolvia `204` e removia fisicamente as turmas elegíveis. A API nova mantém a consulta padrão sem turmas excluídas para clientes anteriores, enquanto a interface nova solicita `includeDeleted=true` para consultar o histórico.

Não há migration de schema nesta alteração. Depois da primeira exclusão lógica, um retorno de versão precisa conservar os leitores e as proteções desses metadados: a versão anterior não reconhece a imutabilidade da turma arquivada. A promoção de produção continua seguindo o environment e os artefatos identificados por commit/digest previstos no repositório.

## Validação concluída em 12/11/2026

Validação com dados fictícios, PostgreSQL 17.11 temporário e isolado, SDK .NET 10.0.401, Node.js 24.22.1 e dependências do frontend instaladas com o lockfile preservado.

| Verificação | Resultado |
| --- | --- |
| Testes unitários do backend | 63 aprovados, sem falhas ou testes ignorados. |
| Testes de integração com PostgreSQL | 107 cenários distintos aprovados, sem falhas ou testes ignorados. |
| Testes do frontend | 278 aprovados em 13 arquivos. |
| Compilação | Solução .NET, TypeScript e build Vite/PWA aprovados. |
| Integridade do diff | `git diff --check` sem problemas. |

Os resultados de integração foram obtidos em uma rodada ampla de 106 cenários e uma rodada final de 17, que repete 16 cenários e acrescenta o teste de concorrência entre exclusão e adesão. Os relatórios TRX ficam em `TestResults/final-backend` e `TestResults/final-guards` no ambiente da execução; essa pasta não é versionada.

Os cenários cobrem preservação de matrículas, presenças, financeiro e vínculos legados; autorização e versões; repetição idempotente; proteção contra reativação, falsificação de metadados e movimentação de histórico; matrícula com início futuro; agenda passada e futura, incluindo o corte no mesmo dia; estados de assinatura; interface de consulta e troca de sessão. Os recortes afetados de cobrança, portal, ensino e calendário de comunicação também foram executados.

O teste `Concurrent_ClassDeletion_and_subscription_cannot_leave_an_automatic_charge_for_an_archived_class` usa dois contextos de banco e operações concorrentes. Se a exclusão vence, não há assinatura nem chamada de criação ao provedor; se a adesão vence, a exclusão é bloqueada e a turma permanece ativa. Estados intermediários de assinatura e a inelegibilidade após exclusão também têm testes determinísticos.

A revisão independente corrigiu três situações: movimentação de vínculo histórico por `PUT`, reassociação de cobrança para criar competência futura e conflito de reserva no intervalo de uma aula já iniciada. A proteção por marcadores derivados também foi limitada aos tipos de registro a que pertence, evitando efeito em cadastros de outros módulos.

Esta validação não realizou exclusão em dados reais nem publicação em produção. A alteração está preparada em branch própria para revisão e promoção pelo fluxo do repositório.
