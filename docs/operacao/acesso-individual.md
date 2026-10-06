# Acesso individual e primeiro acesso

O login aceita usuário ou e-mail e senha, mesmo com Google habilitado. Os usuários antigos continuam usando suas credenciais e permissões. Novas contas sem e-mail podem vincular o próprio Google depois de autenticar com a credencial temporária.

## Provisionamento explícito

1. Publique a API e execute a migration `IndividualFirstAccess` pelo pre-deploy único. Mantenha os bootstraps e migrations de startup desativados.
2. Rode `dotnet LongBeach.Api.dll --provision-first-access --provision-from-stdin` uma única vez no serviço da API. Forneça JSON pela entrada padrão, nunca pela linha de comando ou Git. Não use um terminal que ecoe o conteúdo.
3. O JSON contém `Bootstrap.FirstAccess.Accounts` (lista de `Name`, `Username`, `Role`), `TemporaryPassword` e `ExpiresAtUtc` (UTC, no futuro e no máximo sete dias). O papel deve existir e cada alvo deve estar autorizado. Use um canal privado para entregar a credencial inicial.
4. Confira as contagens de criação e as auditorias. O comando não inicia servidor ou workers. Repetir os mesmos alvos não recria contas, não altera papéis nem redefine senhas, inclusive após a ativação. Conflitos com identidade existente interrompem a transação inteira.

O provisionador mantém somente o hash da senha. Sem e-mail conhecido, usa internamente um endereço aleatório reservado em `.invalid`, omitido das respostas de autenticação. Ele nunca é destinatário de mensagens. `Username` tem índice único sem distinção de caixa.

## Primeiro acesso

A senha temporária concede uma sessão de até quinze minutos, limitada à tela de primeiro acesso, `/auth/me`, troca de senha, vinculação Google e encerramento. Nenhum papel ou permissão operacional é emitido. A API verifica também o estado e a validade da conta ao receber o JWT temporário. A renovação preserva essa limitação e não transforma uma sessão temporária em acesso completo.

- **Nova senha:** confirme a senha inicial, informe e repita uma senha de pelo menos 14 caracteres, com maiúscula, minúscula, número e símbolo. As sessões temporárias são revogadas; entre novamente com usuário e nova senha.
- **Google:** a sessão interna identifica a conta que está sendo ativada. Um segundo token Google é validado por assinatura, emissor, audiência, expiração, `email_verified` e `sub`. A conta Google não pode pertencer a outro usuário. A associação é única pelo `sub`; a senha temporária é destruída e uma nova sessão completa é emitida. Os logins seguintes pela identidade vinculada dispensam edição da allowlist.

A allowlist permanece válida para contas Google legadas. Vincular Google não cria usuários nem amplia papéis. Conclusões concorrentes usam a senha armazenada como controle de concorrência; o índice único impede vinculação dupla. Auditorias ocultam hashes e tokens.

Se a credencial inicial expirar, o provisionador não a redefine silenciosamente. O responsável deverá tratar a recuperação de forma direcionada, após confirmar a identidade. Não é um cadastro público.

## Verificação e retorno

Teste em banco isolado: login por usuário com Google ativo, ambas as conclusões, credenciais Google inválidas, bloqueio de endpoints operacionais, rejeição de JWT/refresh temporário após ativação, idempotência, unicidade e auditoria sem segredos. Na produção, confira login temporário, `/auth/me`, bloqueio dos dados e logout sem concluir a ativação das pessoas.

A migration é aditiva. Mantenha a API nova enquanto houver contas aguardando ativação: a API antiga não conhece a restrição de primeiro acesso. Para retornar a uma API anterior, primeiro desative as contas pendentes e revogue suas sessões em uma operação direcionada e auditada. A web anterior pode ser restaurada sem remover os novos campos, mas não oferece primeiro acesso.

Referência: [validação de ID tokens do Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Indicadores do dashboard

Os controles financeiros e de escola/quadras aparecem no início do painel, identificados pelo mês de origem. Cartões operacionais sem nenhum cadastro ficam indisponíveis e indicam o dado necessário. Com registros carregados, uma contagem zero após aplicar o filtro continua sendo exibida como zero. Uma lista vazia de quadras não representa zero horas livres; o cálculo exige cadastro e horário de funcionamento de todas as quadras consultadas.

Pagamentos mensais não viram contas vencidas ou reservas atuais automaticamente. A grade histórica precisa de confirmação de vigência e identificação das quadras antes de gerar agenda operacional. Estoque esportivo, projetos e manutenção exigem seus próprios cadastros.
