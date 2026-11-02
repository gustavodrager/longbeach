# Conta individual de clientes

Estado em 02/11/2026: implementação local. Este documento não registra implantação, alteração de flags ou conferência de contas de produção. A decisão está no [ADR-021](../adr/ADR-021-conta-individual-clientes.md).

## Conferir os cadastros

O cadastro da pessoa e sua conta de acesso são distintos. Uma ficha pode continuar sem conta até a ativação. Não criar usuários para todas as fichas nem associar pessoas por semelhança de nome, telefone ou e-mail.

Antes de habilitar autocadastro local ou preparar a transição das contas existentes, o Gestor consulta `GET /api/v1/customers/access-review`. Essa leitura exige também `users:manage` e `customers:write`, retorna quantidades e referências para conferência e não altera o banco.

| Indicação | Conferência necessária |
|---|---|
| Cadastro incompleto | Conferir os dados da pessoa sem inventar telefone ou identidade. |
| Acesso pendente | Confirmar se a pessoa deve receber convite ou utilizar uma conta existente. |
| Conta Cliente sem cadastro | Conferir a associação individual; não unir por e-mail ou nome automaticamente. |
| Contato compartilhado | Identificar as pessoas envolvidas. Compartilhar telefone não significa ser dependente. |
| Responsável escolar ou autorização existente | Conferir quem pode acompanhar a agenda e quem responde financeiramente. São relações distintas. |
| Conta inativa | Conferir a situação administrativa antes de liberar acesso. |

Esse relatório não classifica adultos ou dependentes e não executa conversões. As referências são administrativas e não devem ser publicadas como uma lista de clientes.

## Acesso próprio

Na ficha do cliente, a gestão pode conferir o estado da conta: aguardando ativação, convite pendente, ativa, primeiro acesso pendente, bloqueada ou acesso pelo responsável.

Para ativar uma ficha existente sem conta:

1. Conferir a ficha e confirmar a identidade da pessoa.
2. Emitir o convite de ativação. A emissão exige Gestor e a versão atual do cadastro.
3. Entregar o link pelo meio autorizado pela gestão. O sistema não envia mensagem automaticamente.
4. A pessoa escolhe um usuário único e senha, ou o Google quando habilitado. Depois entra na sua conta.

O convite dura sete dias. Gerar outro revoga o anterior; alterações no cadastro ou no vínculo podem tornar o link inválido. A gestão pode revogá-lo sem excluir a ficha. Se a emissão for interrompida, conferir o estado e, se necessário, gerar um novo link: a resposta contendo o segredo não é recuperada por repetição.

No cadastro local público, nome e telefone identificam o contato cadastral; o login é o usuário escolhido, com senha. O e-mail de contato não é tratado como endereço verificado para autenticação ou associação automática. Cadastros públicos novos recebem apenas o perfil Cliente. Associar Google e senha não acrescenta perfis.

Os seletores administrativos e do bar aceitam contas ativas com primeiro acesso concluído, inclusive contas locais. Buscam também pelo usuário e ocultam endereços internos reservados. A equipe conserva seu perfil e sua área pessoal.

## Dependentes

O Gestor cadastra uma autorização para uma conta de responsável já existente. O dependente e seus aliases precisam estar sem conta própria. A conta do responsável deve estar ativa, com primeiro acesso concluído; ela pode ser Cliente ou pertencer à equipe.

O vínculo concede acesso aos alunos do dependente associados pelo cadastro único. Não transfere a titularidade financeira, não dá acesso ao bar de outra pessoa e não exige criar uma conta de login para o dependente.

Ao revogar:

- Preservar o registro da autorização; não apagar a linha para remover acesso.
- Conferir a agenda do responsável: vínculos antigos do portal ou de cobrança não restabelecem acesso escolar ao dependente.
- Considerar também reservas remarcadas do dependente. Uma solicitação antiga confirmada não supera a revogação.
- Preservar matrículas, presenças, solicitações e obrigações financeiras históricas.

Qualquer autorização registrada, mesmo revogada, mantém o cadastro sob esse controle explícito. Contatos compartilhados não criam essa condição. Aliases acompanham a família canônica; pares repetidos ou contraditórios exigem conferência, com a negativa prevalecendo. Não unificar duas famílias com autorizações, nem misturar uma família controlada com uma conta própria.

Para adultos, associar `Customer.UserId` não concede agenda automaticamente. Os vínculos de portal e de responsabilidade financeira já existentes continuam com seus limites.

## Recuperação e mudança de método

Para recuperar uma conta Cliente, o Gestor confirma a identidade e emite um link válido por trinta minutos. A recuperação define usuário e senha e encerra as sessões anteriores. Não usar esse procedimento para contas de Professor, Atendente ou Gestor: elas exigem o atendimento administrativo próprio. Contas legadas com primeiro acesso pendente continuam utilizando o acesso inicial entregue pela gestão.

Na área pessoal, definir ou trocar senha exige a senha atual ou uma nova confirmação do Google já vinculado. Acrescentar Google exige a senha atual e uma nova confirmação da conta Google. O sistema recusa uma identidade Google ou usuário já pertencente a outra conta. Mudanças de método e recuperação avançam a versão das credenciais e revogam refresh tokens, impedindo que sessões anteriores mantenham o acesso.

Convites e recuperação usam segredos aleatórios de 256 bits. O servidor persiste somente hashes; o link contém o segredo no fragmento e é enviado ao servidor no corpo das operações. Não registrar links completos, senhas ou tokens em logs, auditorias, documentos versionados ou comprovantes compartilhados. Entregar o link somente à pessoa cuja identidade foi conferida.

## Configuração e implantação

| Configuração | Comportamento quando ausente |
|---|---|
| `Authentication:Local:Enabled` | `true`: login local pode coexistir com Google. |
| `Authentication:Local:ClientRegistrationEnabled` | `false`: autocadastro local permanece fechado. |

A interface consulta as opções do servidor. A ausência da segunda flag não autoriza habilitá-la durante uma publicação. Sua habilitação depende da conferência de contas e de aprovação específica. As opções e o cadastro OAuth do Google permanecem independentes.

A migration preparada é `20261102163528_ClientIndividualAccess`, elevando o schema de 31 para 32 migrations. O hash esperado nas fontes do Dockerfile e do preflight é `e68bb0b2cacc3f30bd53bbda0ce192f7803708bef66e2fdfeb800f29016884a0`.

Ela acrescenta `client_access_challenges` e `customer_guardian_access`, com referências restritivas, índices únicos e histórico preservado. Acrescenta também as versões de credenciais de usuários e refresh tokens, inicialmente zero, e o indicador de senha local, inicialmente habilitado para preservar o legado. Não cria contas nem autorizações em massa. Novas contas Google deste fluxo começam com senha local desabilitada.

Os grants novos permitem ao runtime ler, inserir e atualizar. Exclusão, truncamento e privilégios adicionais são retirados; `PUBLIC` e os papéis do transporte WhatsApp não recebem acesso às tabelas novas. A aplicação também rejeita exclusão física de desafios e autorizações.

A implantação futura precisa de plano próprio para API, interface, banco e contrato do preflight instalado. Antes da execução, identificar os artefatos e a autorização, conferir backup recuperável e ensaiar a migration localmente. Coordenar os escritores, executar a migration uma única vez por job controlado e conferir schema, grants, contas existentes e credenciais antes de liberar a nova API e interface. Não usar migration ou seed automático no início de cada réplica.

Depois do uso, não executar `Down` para apagar desafios, responsáveis ou versões de credenciais. O guard de downgrade recusa esse apagamento. Um retorno de aplicação também precisa ser conferido quanto à compatibilidade com os métodos e sessões novos; não restaurar uma cópia antiga sobre dados ativos como atalho.

Nenhuma dessas ações hospedadas foi realizada nesta etapa. O inventário real e o relatório final de validação serão registrados na operação correspondente.
