# ADR-005 — Registros da arena, persistência e identidade visual

- Status: implementado, aguardando ensaio com dados de staging e promoção controlada.
- Data: 2026-10-04.
- Complementa ADR-001, ADR-003 e ADR-004. A autorização do usuário para ampliar a implementação substitui a restrição anterior de permanecer apenas no protótipo. A avaliação humana continua sendo uma atividade de validação, não um resultado presumido.

## Decisão

A aplicação mantém suas camadas, autenticação, API, PostgreSQL e registro de auditoria. Agenda, escola, financeiro operacional e manutenção usam contratos TypeScript explícitos e novos tipos no armazenamento `operational_records` já existente. Nenhuma tabela histórica é apagada ou automaticamente migrada. Mensalidades, presença e matrícula são registros próprios; os campos livres antigos do aluno não são usados como fatos financeiros ou de frequência.

Tipos adicionados: `courts`, `reservations`, `classes`, `enrollments`, `presences`, `financeEntries`, `maintenance`. Os tipos existentes `students`, `team`, `inventory`, `projects` permanecem compatíveis. `version` é metadado aditivo para controle de edição concorrente, iniciando em zero para registros históricos e incrementando na primeira alteração.

Reservas e aulas ativas ocupam a mesma capacidade da quadra. A consulta tipada `/operations/courts/schedule?date=YYYY-MM-DD` devolve minutos reservados, aulas, disponibilidade e intervalos de ocupação sem nomes, contatos ou alunos. A recepção usa essa fonte mesmo sem permissão de ler os registros da escola; IDs de aulas só são incluídos quando a conta também pode consultar a escola. A API verifica horários de funcionamento, sobreposição, quadras em manutenção, vagas, matrícula ativa duplicada, presença por data e duplicidade de mensalidade por matrícula/competência. Um bloqueio transacional PostgreSQL serializa gravações operacionais entre réplicas; a versão evita sobrescrever uma edição que ficou desatualizada. Repetir o mesmo conteúdo no mesmo ID retorna o registro confirmado sem nova alteração.

## Grupos recorrentes

O cadastro de grupos cria entre 1 e 12 reservas semanais, com primeira data, quadra e horários explícitos. `POST /operations/reservations/recurring` exige `projects:write` e confirma todas as ocorrências em uma transação sob o mesmo bloqueio da agenda. Uma semana em conflito com reserva, bloqueio ou aula cancela a criação de todo o grupo. Não existe expansão infinita nem geração automática posterior.

Cada ocorrência tem ID determinístico próprio, versão e metadados `groupId`, `groupTitle`, `occurrenceIndex`. Alterar, cancelar ou concluir uma ocorrência preserva sua origem e não muda as demais semanas. Cobranças financeiras continuam ligadas ao ID individual da reserva; criar um grupo não registra recebimento nem cria mensalidade ou cobrança implícita.

A identificação da solicitação também identifica o grupo. O registro interno `reservationGroups`, inacessível pelas rotas genéricas, guarda nome/identificação, versão, hash do pedido normalizado e IDs das ocorrências, sem copiar telefone, cliente ou observações do pedido. Repetir a mesma solicitação devolve as versões atuais sem duplicar reservas ou restaurar dados anteriores. Reutilizar a identificação para conteúdo diferente resulta em conflito. O formulário mantém o corpo e a identificação quando a confirmação é incerta; só permite uma nova intenção depois de erro conhecido ou confirmação.

Valores de reservas são ocultados sem `finance:read` e preservados em alterações sem `finance:write`. Definir valor positivo na criação de um grupo exige essas permissões financeiras; a recepção pode registrar seus horários com valor a ser definido pela gestão. O provider confirma a resposta completa antes de publicar as ocorrências e mantém o mesmo comportamento atômico na demonstração local explícita.

## Permissões

| Área | Leitura | Alteração |
| --- | --- | --- |
| Alunos, turmas, matrículas, presenças | `students:read` | `students:write` |
| Equipe | `employees:read` | `employees:write` |
| Materiais da arena | `inventory:read` | `inventory:write` |
| Projetos, quadras, reservas, manutenção | `projects:read` | `projects:write` |
| Lançamentos financeiros | `finance:read` | `finance:write` |

Custos, remuneração e campos de pagamento do cadastro histórico são ocultados sem `finance:read`, com marcador `costsVisible:false`. Alterações sem `finance:write` preservam os valores financeiros originais. A interface apresenta acesso restrito, sem exibir o valor neutralizado como indicador real. O papel Owner mantém acesso administrativo. Outros papéis dependem das permissões existentes e de seus grants próprios. Uma conta apenas com o papel Student não acessa os cadastros administrativos: ainda não existe vínculo verificado entre a identidade e um registro de aluno que permita limitar esse acesso à própria ficha. O modo de demonstração pública anterior só pode acessar os quatro tipos antigos; ele não abre os novos módulos de arena. Para ensaiar os módulos novos sem conta, usar a demonstração local explícita da aplicação, nunca habilitar acesso anônimo em produção.

## Dados e confirmação

Produção consulta exclusivamente a API autenticada, incluindo quando não existe configuração `VITE_OPERATIONAL_STORAGE`. Dados locais do navegador não são enviados ao banco. O provider limpa dados privados ao mudar de identidade ou permissões e ignora respostas de sessões anteriores. As páginas esperam a confirmação da API antes de fechar formulários ou apresentar o cadastro salvo; falhas preservam o formulário. IDs de solicitações novas não confirmadas permanecem estáveis para a repetição da mesma intenção.

Os dados fictícios mantêm chave local própria e não são usados como fallback de produção. Importação real continua exigindo o processo explícito de staging, validação, reconciliação e proveniência definido no ADR-001.

Auditoria existente registra ator, tipo, ID e ação sem copiar o payload que pode conter dados pessoais. O mecanismo de versões e o bloqueio são da aplicação e não exigem nova migration estrutural.

Esta primeira implementação carrega os cadastros de cada tipo autorizado e valida gravações contra um snapshot dos registros operacionais. O bloqueio global mantém os critérios coerentes entre gravações concorrentes, mas limita a vazão de escrita e requer memória proporcional aos cadastros. Antes de adotar volumes elevados, esses módulos precisam de consultas paginadas, índices específicos e validações por conjuntos relevantes. Os detalhes dos indicadores do bar já usam consultas paginadas próprias; o snapshot operacional não é uma solução de análise de grandes volumes.

## Interface

A marca vetorial oficial vem do manual de identidade fornecido pelo usuário. Login, conta, administração, operações, favicon e ícones PWA utilizam a mesma identidade: areia `#F2E8D8`, preto `#171717`, amarelo `#F5BE3D`, Manrope hospedada pela própria aplicação e licença OFL preservada. O estoque de materiais da arena fica separado do estoque do bar.

Atendimento utiliza quatro caminhos estáveis — Vender, Comandas, Pedidos e Meu caixa — com navegação própria. Gestão mostra os módulos permitidos e um menu legível no celular. Ações principais têm pelo menos 56 px; controles menores têm pelo menos 48 px.

## Limites de implantação

Os tipos operacionais aditivos permitem evolução reversível sem alterar o sistema legado. A promoção hospedada continua sujeita ao environment aprovado e a artefato identificado, conforme AGENTS.md. A implementação local não comprova homologação Pix, reconciliação com registros reais, teste humano nem disponibilidade dos serviços de produção.
