# Agenda e disponibilidade — auditoria e revisão local

Data: 28/10/2026. Este registro reúne a leitura da aplicação principal e dos documentos de produto, arquitetura e operação. Os ajustes e a prévia desta etapa são locais; este documento não comprova publicação nem alteração de produção.

## Mapa das experiências

| Página ou rota | Tarefa e alcance |
| --- | --- |
| `/agenda` | Agenda operacional da gestão/recepção. Semana, dia e lista no período apresentam reservas, mensalistas, aulas, bloqueios e disponibilidade, conforme filtros e permissões. |
| `/agenda/novo` e `/agenda/:reservationId` | Cadastro ou ficha de uma reserva/bloqueio. Abrir um intervalo livre preenche uma proposta de horário; a disponibilidade é conferida novamente ao salvar. |
| `/agenda/recorrentes/novo` | Criação explícita de uma série semanal finita. Possui validação conjunta e não substitui o acordo mensalista. |
| `/agenda/funcionamento` | Dias, horários, preços e confirmação do funcionamento das quadras. `/quadras` é um endereço de compatibilidade. |
| `/mensalistas` e `/mensalistas/:groupId` | Acordo do grupo, integrantes, competências, encontros e presença. O cadastro do acordo, sozinho, não ocupa a quadra. |
| `/escola` e `/escola/turmas/:classId` | Grade de turmas, professor, esporte, vigência e capacidade. O nome da turma continua opcional, com identificação por esporte, dia e horário quando ausente. `/escola/:classId` redireciona para a ficha canônica. |
| `/escola/matriculas` e `/escola/presencas` | Matrícula e chamada são registros próprios; não se confundem com ocupação da quadra nem com cadastro do aluno. |
| `/solicitacoes-clientes` | Análise, confirmação, alternativa, indisponibilidade e histórico dos pedidos pela equipe autorizada. |
| `/minha-area/agenda` | Compromissos vinculados ao cadastro do próprio cliente, nos últimos 30 dias e próximos 60 dias; inclui acompanhamento das próprias solicitações. Não é a agenda geral da arena. |
| `/minha-area/solicitar` | Consulta limitada de horários livres e envio de preferência de reserva, aula experimental ou mudança de compromisso. Não apresenta identidades nem atividades de terceiros. |
| `/minha-area/ajuda` | Pedido de orientação/correção à equipe, com resposta acompanhada nas solicitações. |
| `/professor`, `/professor/turmas`, `/professor/presencas` e `/professor/turmas/:classId` | Aulas e turmas vinculadas ao professor, encontros avulsos confirmados e chamada autorizada. Não fornecem disponibilidade geral da arena nem acesso administrativo aos alunos. |
| `/prototipo/*` | Demonstração independente. Não substitui as rotas operacionais e suas permissões. |

O critério do [ADR-009](../adr/ADR-009-consolidacao-de-paginas.md) é preservar tarefas distintas, seus históricos e operações. A revisão de UX não cria outra agenda nem reúne indiscriminadamente calendário, acordo mensal, matrícula, chamada e solicitação.

## Regras que a interface deve preservar

### Disponibilidade e horários

- Aulas ativas, a partir do início da grade, e reservas não canceladas compartilham a capacidade da mesma quadra. Aula experimental confirmada é uma reserva classificada como aula, sem criar matrícula nem ampliar a capacidade de uma turma.
- A semana vai de segunda a domingo. Datas, mudança de mês/ano e término às `24:00` devem manter o dia escolhido. No formulário pessoal, o término visual `00:00` é enviado como `24:00` daquele dia.
- A ocupação total é a união dos intervalos: uma sobreposição não pode somar minutos duas vezes. Filtros visuais não alteram a capacidade real.
- `freeIntervals: null` representa disponibilidade pendente/desconhecida; `[]` pode representar dia fechado, manutenção ou ausência real de intervalos. Falha, falta de permissão e configuração pendente não podem aparecer como horários livres.
- Reserva cancelada permanece consultável em lista/histórico, mas deixa de ocupar o calendário. Atividades conflitantes ou fora do funcionamento permanecem visíveis com aviso; ocultá-las não corrige o cadastro.
- Uma única quadra é selecionada automaticamente depois que seus dados chegam. Quando há várias quadras, a seleção e a identificação de cada uma precisam ser claras.
- Lista e dia devem manter a mesma origem das ocorrências de aulas; lista parcial por falha da consulta não equivale a lista vazia. Períodos são ordenados e limitados a 366 dias inclusivos.

Fontes: [agenda semanal](agenda-semanal-20261010.md), [primeira etapa](agenda-etapa1-20261010.md), [ADR dos registros tipados](../adr/ADR-005-arena-registros-tipados-e-persistencia-autorizada.md) e `frontend/src/features/arena/queries.ts`.

## Ajustes implementados

O foco informado pelo usuário foi entender quais horários estão livres ou ocupados. A agenda operacional continua em uma rota, com três visualizações; as tarefas pessoais, de ensino, funcionamento e mensalistas mantêm seus acessos e regras próprios.

- A semana apresenta um resumo do dia de referência com intervalos livres e ocupados lado a lado, usando a consulta completa. A união de ocupações evita duplicar sobreposições. Os atalhos levam à consulta diária de vagas ou de todas as atividades.
- Quando há várias quadras, o seletor fica visível junto à visualização. Os cartões semanais identificam a quadra e a condição livre/ocupado/bloqueado; nomes acessíveis dos links também incluem a quadra. A única quadra continua selecionada automaticamente.
- Fechamento, manutenção, pendência e falha de consulta têm mensagens explícitas. Quadra sem conferência, linha ausente ou resposta com erro não oferece intervalos livres. Fechamento conhecido prevalece sobre uma pendência de conferência, sem mensagem contraditória de disponibilidade desconhecida.
- No dia, os intervalos livres aparecem antes das atividades. Reservas e bloqueios indicam a ocupação; canceladas consultadas em lista explicitam que não ocupam a quadra. O resumo semanal não é repetido no dia, para evitar duplicar os cartões.
- Aulas e horários livres ignoram filtros antigos de situação/grupo de reserva que não se aplicam. O controle de situação fica desabilitado nessas seleções. Isso impede um falso zero, inclusive em URLs antigas e quando o operador tenta aplicar a situação depois da atividade.
- Trocar semana/dia/lista conserva a referência temporal. A lista começa no dia ou semana visível; sair de uma lista com período futuro e criar uma reserva usa o início desse período, mesmo sem `date` na URL.
- A semana explica que os filtros destacam atividades sem liberar seus horários. A lista explica a consulta por período. Minha agenda e Minhas turmas esclarecem o vínculo pessoal e onde consultar a disponibilidade geral.

Não houve alteração de contrato, regra de ocupação no servidor, navegação principal, autorização ou dados.

### Navegação e uso no celular

- Sem escolha explícita na URL, a agenda usa o dia no celular e a semana no desktop. Uma escolha explícita de visualização deve prevalecer.
- Trocar dia/semana/lista deve conservar a referência temporal e os filtros compatíveis. O período visível da lista precisa orientar a nova reserva; uma data antiga residual na URL não deve levar o operador a outro período.
- Reservar a partir de um intervalo livre conserva o contexto de retorno. A duração inicial é de até uma hora, limitada ao intervalo; o usuário continua podendo editar a proposta.
- Filtros ativos e sua limpeza devem permanecer acessíveis quando o painel estiver recolhido. A semana distingue destaque visual de filtragem; dia/lista filtram os registros exibidos.
- Voltar, Avançar, Escape, Cancelar, foco e proteção de rascunho precisam funcionar sem reabrir editores por parâmetros antigos de URL (`acao`/`registro`).
- A grade pode ter rolagem própria; a página inteira não deve transbordar horizontalmente em 320/390 px. Datas completas, indicação de hoje e seleção do dia precisam continuar legíveis.
- Preservam-se a identidade visual e os componentes existentes: Manrope local, areia `#F2E8D8`, preto `#171717` e amarelo `#F5BE3D`. O ADR dos registros estabelece ações principais de pelo menos 56 px e controles menores de pelo menos 48 px.

Fontes: [UX da agenda](agenda-ux-2026-10-15.md), [UX interna](ux-interna-2026-10.md) e [critérios de pronto](../produto/criterios-de-pronto.md). As contagens de testes e capturas nesses documentos são retratos das respectivas datas, não resultados desta revisão.

### Mensalistas, recorrência e aulas

- O grupo mensalista pode existir com dados ainda incompletos. Não preencher integrantes, capacidade, vencimento ou valores desconhecidos com exemplos ou valores inferidos.
- Gerar encontros de uma competência é uma ação explícita, precedida pela prévia das datas e validação de todos os conflitos. Uma série genérica de 1 a 12 reservas semanais não se transforma em grupo mensalista.
- Editar o acordo ou os participantes atuais não reescreve os encontros, participantes e valores já preservados na competência. Alterar um encontro não modifica os demais.
- Cobrança mensal e recebimento são ações distintas e explícitas. A opção de gerar cobrança é inicialmente desmarcada; encontro incluído no acordo mensal não deve receber uma cobrança individual automática.
- Valor desconhecido permanece “A combinar”; zero só representa zero explicitamente informado. Regras pendentes de quinta ocorrência não devem ser resolvidas inventando cobrança.
- Chamada respeita vínculo, vigência da turma e matrícula, data válida e permissão. Uma ausência não registrada não vira falta fictícia; encontros futuros ou cancelados têm restrições próprias.
- Importar uma grade exige staging, validação e proveniência próprios. Importação não é mecanismo de semear uma prévia de UX, nem confirma sozinha a disponibilidade completa da arena.

Fontes: [mensalistas](mensalistas-quadra.md), [edição contextual](mensalistas-edicao-contextual.md), [importação de grade](importacao-grade-aulas.md) e [experiências por perfil](../adr/ADR-005-experiencias-por-perfil.md).

### Área pessoal e professor

- O acesso pessoal depende de vínculo explícito; semelhança de nome/e-mail não concede acesso. O professor só recebe os dados necessários às turmas e encontros vinculados.
- A solicitação não segura horário, garante professor ou altera o compromisso atual. Alternativa exige aceite explícito do cliente e nova conferência de disponibilidade; pedido pendente não ocupa a quadra.
- Cancelamento/remarcação de uma aula pelo cliente afeta sua ocorrência, sem alterar a turma inteira ou outros alunos. Reserva remarcada mantém sua identidade; encontro mensalista conserva as regras da competência.
- Retirar pedido pendente não cancela um compromisso confirmado. Erro de consulta não pode virar agenda vazia; envio incerto deve manter a mesma intenção para verificação, sem duplicação.
- Confirmar pedido não cria pagamento, estorno ou matrícula automaticamente. Não há envio externo de notificações nesta revisão.

Fontes: [área pessoal](../adr/ADR-007-area-pessoal-cliente.md), [solicitações e disponibilidade](../adr/ADR-007-solicitacoes-e-disponibilidade.md) e [operação do cliente](perfil-cliente.md). Trechos antigos sobre provedor ou publicação nesses registros são históricos; não são instruções para executar infraestrutura atual.

## Execução local e dados fictícios

A aplicação permanece em `longbeach-os/`, com `frontend/` e `backend/`. A revisão não cria uma cópia da aplicação em evidências ou em outra pasta.

O launcher `iniciar-local.command` usa a prévia persistente já configurada: API em `localhost:5320`, interface em `localhost:5321`, contêiner `longbeach-perfis-test` e banco `longbeach_profiles_preview` na porta 55439. A configuração privada fica fora do Git. Esse banco contém dados preservados; iniciar a aplicação não o torna uma base fictícia descartável. O launcher mantém migrations, seeds, bootstrap e jobs automáticos desabilitados. Não é necessário iniciá-lo para revisar estas alterações de UX.

Uma demonstração inteiramente no navegador precisa combinar `VITE_DEMO_MODE=true`, `VITE_OPERATIONAL_STORAGE=local` e `VITE_API_URL` vazio, em contexto de navegador separado e com dados sintéticos. `DemoDataProvider` inicia com coleções vazias e usa a chave local `longbeach-os-demo-v1`; não existe importação automática desses registros para produção. Misturar demo com storage `postgres` e API preenchida pode habilitar consultas remotas, por isso não serve ao isolamento pretendido.

As rotas pessoais, do professor e de análise de solicitações são excluídas do modo demo simples. Sua validação isolada pode usar os harnesses existentes de `AuthContext`, `QueryClient` e `MemoryRouter`, com `fetch` simulado e dados fictícios. Não se altera a autenticação da aplicação para habilitar uma prévia.

Para a conferência visual desta etapa, o apoio fica somente em `../evidencias/agenda-disponibilidade-2026-10-28/`: servidor HTTP sintético em `127.0.0.1:5194`, consumido pelo Vite da aplicação principal em `127.0.0.1:5193`. O contrato é de leitura, com a única exceção do handshake fictício `POST /api/v1/auth/refresh` necessário ao bootstrap existente. Escritas de negócio são recusadas. Os fixtures não acessam banco, arquivos privados ou rede externa; a leitura sintética não comprova integração com a API real. O servidor não faz parte do produto e deve ser encerrado após a prévia.

Não usar importadores ou `--apply-local-fixtures` para essa finalidade: esses utilitários possuem efeitos administrativos explícitos no banco de prévia. Testes de integração PostgreSQL continuam restritos a banco exclusivo cujo nome contenha `test`, conforme [estrutura local](estrutura-local.md). Ferramentas e recibos históricos em `arquivo/` e `evidencias/outputs/` não são executados nesta revisão.

## Cobertura existente e validação desta etapa

| Conjunto | O que já protege e deve ser reaproveitado |
| --- | --- |
| `pages/ArenaPages.test.tsx` | Ocorrências de aulas, início da grade, filtros sem falsear capacidade, privacidade, consulta parcial, filtros recolhidos, disponibilidade pendente, seleção responsiva, intervalos até 24h e retorno da reserva. |
| `features/arena/agenda.test.ts` | Semana atravessando mês/ano, proposta limitada ao intervalo e conservação de período/filtros ao abrir reserva. |
| `pages/agendaNavigation.test.ts` | Referência temporal entre visualizações, período da lista, semana atravessando ano e preservação de entradas inválidas para validação da página. |
| `pages/AgendaAvailability.test.tsx` | Identificação/seleção da quadra, filtros incompatíveis, proposta de nova reserva a partir do período visível da lista e fechamento/manutenção conhecidos apesar de conferência pendente. |
| `pages/AgendaAvailabilitySummary.test.tsx` | União dos horários ocupados, imutabilidade, recorte ao funcionamento, meia-noite e estados carregando/ausente/falha/pendente/fechado/manutenção. |
| `pages/RecurringReservationsPage.test.tsx` | Conflito sem criação parcial, repetição de intenção incerta, clique duplo e limites da série. |
| `pages/RentalGroupsPage.test.tsx` | Acordo incompleto, geração e cobrança explícitas, competência, participantes preservados, edição contextual, falha/repetição, leitura sem edição e proteção de rascunho. |
| `features/portal/ClientPages.test.tsx` | Navegação pessoal, falha sem falso vazio, intenção estável, alternativa explícita, disponibilidade sem intervalos fictícios e retirada versionada. |
| `features/portal/RequestManagement.test.tsx` | Confirmação com quadra/professor mantendo o pedido e exibição de retirados sem ação indevida. |
| `features/teaching/TeachingPages.test.tsx` | Navegação própria, vínculo ausente, acesso direto negado, presença versionada, falha sem falso vazio e encontro experimental vinculado. |

Os ajustes de texto desta contribuição são limitados a duas orientações: Minha agenda explicita os compromissos vinculados ao cadastro e aponta a consulta de horários pelo pedido; Minhas turmas explicita o vínculo do professor e o papel da gestão na disponibilidade geral. O aviso existente de que solicitar não garante vaga nem altera o compromisso foi preservado. Não foram alterados rotas, permissões, DTOs, ações ou dados por esses ajustes.

Os testes existentes de portal, análise de solicitações e professor passaram: **20 testes em 3 arquivos**, executados localmente com `fetch` simulado. Log privado: `../evidencias/agenda-disponibilidade-2026-10-28/portal-professor-tests.log`. A revisão dos dois componentes confirmou que os ajustes ficaram restritos a texto, sem novos hooks, efeitos, consultas, estados ou controles.

A validação final passou: **663 testes em 68 arquivos**, sem falhas ou skips, incluindo 14 testes novos de integração da agenda, 19 de navegação e 11 do resumo. Os dez primeiros casos de integração falharam antes da correção e passaram após a integração, preservando todos os testes antigos. A compilação da interface passou e a API compilou sem avisos nem erros; não se executaram migrations nem testes com banco real.

Registros privados desta execução em `../evidencias/agenda-disponibilidade-2026-10-28/`: `frontend-tests-closed-final.log`, `frontend-build-closed-final.log`, `api-build.log`, recibos das rodadas RED/GREEN e testes offline do fixture. Os logs de teste apresentam avisos esperados do ambiente DOM sobre `scrollTo`; não houve falha de teste associada.

A inspeção visual usou somente a API fictícia e a aplicação principal local. Conferidos: desktop, 390 px e 320 px; seleção e identificação de quadra; resumo livre/ocupado; quadra pendente sem links de vaga; dia fechado sem reserva; atalhos para dia; período futuro sem `date` preservado ao trocar para semana e ao propor nova reserva; preenchimento de data/quadra/horário a partir de uma vaga; Cancelar, Escape e navegação Voltar/Avançar sem reabrir janela. Em 320 e 390 px a largura do conteúdo coincidiu com a largura da página, sem transbordamento horizontal global. Nenhuma reserva foi salva.

Capturas fictícias: `agenda-desktop.png`, `agenda-semana-390.png`, `agenda-dia-390.png` e `agenda-dia-320.png`, na mesma pasta privada. O controle temporário de largura do navegador foi restaurado ao final. A cobertura de autorização da recepção, área pessoal e professor permaneceu nos testes com respostas simuladas; a sessão do fixture não comprova autenticação real.

As abas de inspeção e os dois servidores temporários foram encerrados após a conferência. A prévia persistente e os ambientes hospedados não foram alterados.

## Limites e pendências de aceite

- Este documento não autoriza nem registra deploy, migrations, importação ou alteração de dados reais.
- A revisão e os ajustes estão locais, na branch `codex/agenda-disponibilidade-20261028`; a produção ainda não recebeu estas alterações.
- A prévia sintética ajuda a avaliar hierarquia, linguagem, filtros, datas e contexto; não comprova autorização real, concorrência, persistência ou cobrança.
- Estado de produção e comprovantes de publicações anteriores continuam nos registros próprios; seus hashes, fontes e aprovações não são reinterpretados por esta revisão local.
