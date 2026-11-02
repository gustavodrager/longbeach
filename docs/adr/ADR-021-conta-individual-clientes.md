# ADR-021 — Conta individual e acesso de responsáveis

Data: 02/11/2026. Estado: implementação local; implantação e conferência das contas reais dependem de operação aprovada.

Complementa os ADRs [018 — Cadastro único de clientes](ADR-018-cadastro-unico-clientes.md) e [019 — Quatro perfis exclusivos](ADR-019-quatro-perfis-exclusivos.md).

## Identidade cadastral e conta

`Customer` continua representando a pessoa atendida. `User` representa quem se autentica. O vínculo próprio é individual, de um cliente para uma conta, e pode permanecer ausente enquanto o acesso não for ativado. Clientes antigos, históricos, matrículas e pagamentos não são recriados para implantar esse vínculo.

Nome, telefone ou e-mail de contato compartilhado não comprovam identidade e não autorizam associação, unificação ou recuperação automática. No cadastro local, o e-mail informado é contato; a autenticação usa um usuário único e senha. O endereço interno reservado da conta local não é exibido como contato do cliente.

O autocadastro público cria somente o perfil Cliente, identificado internamente por `Student`. Associar o Google ou acrescentar senha não muda o perfil. Professor, Atendente e Gestor conservam seu único perfil e podem utilizar sua área pessoal com os métodos de autenticação permitidos.

## Ativação e métodos de autenticação

A pessoa pode criar o próprio cadastro quando o servidor habilitar essa opção. Para uma ficha existente sem conta, o Gestor confirma a identidade e emite um convite de ativação. A ativação cria a conta local ou associa uma identidade Google verificada, sem tomar uma conta já pertencente a outra pessoa ou reaproveitar uma conta interna como Cliente.

Convites duram sete dias; links de recuperação assistida duram trinta minutos. O segredo tem 256 bits aleatórios e somente seu hash é persistido. O link é retornado na emissão, sem armazenamento de resposta para repetição da operação. Novos links revogam os anteriores. Consumo, revogação, expiração, versão do cliente, vínculo da conta e versão das credenciais são conferidos novamente no servidor.

A recuperação pelo cadastro de cliente exige Gestor, confirmação de identidade e uma conta com perfil Cliente. Ela não recupera contas da equipe. A troca de senha pela própria pessoa exige a senha atual ou uma nova prova do Google já vinculado. Acrescentar Google a uma conta com senha exige a senha atual e uma nova prova Google verificada. Colisões com outra conta são recusadas.

`CredentialVersion` invalida os tokens de acesso anteriores após recuperação ou mudança de método, junto da revogação dos refresh tokens. O primeiro acesso administrativo já existente permanece separado e conserva seu fluxo.

## Dependentes e responsáveis

A autorização usa `CustomerGuardianAccess`, independente de `Customer.UserId` e da responsabilidade financeira. A existência de qualquer registro de autorização, inclusive revogado, coloca a família canônica do cadastro sob controle explícito de responsáveis. Isso não é inferido por idade, nome ou contato.

- O primeiro vínculo exige que o cliente e seus aliases não possuam conta própria. Depois disso, a associação de uma conta própria é recusada enquanto houver esse histórico.
- O responsável precisa de conta ativa, primeiro acesso concluído e um dos quatro perfis válidos. Pode manter seu perfil de equipe; não acumula Cliente.
- A concessão acrescenta acesso aos alunos associados ao dependente pelo cadastro único. Não transfere comanda, cobrança ou conta financeira.
- A revogação ou ausência de autorização prevalece sobre vínculos antigos do portal e sobre `BillingAccount.StudentId` para a agenda do dependente. Reservas remarcadas que pertencem ao dependente também respeitam essa autorização, mesmo quando há uma solicitação antiga confirmada.
- A revogação permanece registrada. Aliases seguem a mesma regra; diante de pares conflitantes, a negativa prevalece e a manutenção é bloqueada para conferência. Unificações que misturam duas famílias controladas ou uma família controlada com conta própria são recusadas.

A associação de uma conta própria de adulto não concede automaticamente agenda por `Customer.UserId`. As autorizações anteriores de portal e financeiro continuam valendo para os adultos. O histórico financeiro mantém sua titularidade mesmo quando o acesso à agenda de um dependente é revogado.

## Flags e conferência anterior à implantação

`Authentication:Local:Enabled` tem padrão `true`, permitindo login local junto do Google. `Authentication:Local:ClientRegistrationEnabled` tem padrão `false` quando ausente. Habilitar autocadastro local exige conferência das contas e autorização; esta implementação não altera a configuração hospedada.

`GET /api/v1/customers/access-review` é uma leitura restrita ao Gestor, com `users:manage` e `customers:write`. Aponta contatos compartilhados, cadastros incompletos ou pendentes, contas Cliente sem cadastro e vínculos de responsáveis que precisam de revisão. O relatório não infere dependência, não associa contas e não corrige registros em massa.

## Persistência e implantação

A migration `20261102163528_ClientIndividualAccess`, a 32ª, acrescenta desafios, autorizações e versões de credenciais. Os valores iniciais preservam as contas existentes: `LocalPasswordEnabled=true` e `CredentialVersion=0`, inclusive nos refresh tokens. Contas Google novas criadas por este fluxo recebem senha local desabilitada até a pessoa configurá-la; o legado não é reclassificado automaticamente.

As tabelas novas concedem ao runtime somente `SELECT`, `INSERT` e `UPDATE`; não concedem exclusão ou privilégios a `PUBLIC` e ao transporte WhatsApp. As relações preservam seus registros por chaves restritivas e guardas da aplicação. O downgrade recusa apagar desafios, autorizações ou credenciais que já estejam em uso.

Dockerfile e preflight acompanham o contrato de 32 migrations, hash `e68bb0b2cacc3f30bd53bbda0ce192f7803708bef66e2fdfeb800f29016884a0`. A mudança exige um plano próprio de implantação de API, interface e banco, com job único de migration, artefatos identificados e aprovação. Não houve ação em produção nem inventário real das contas nesta etapa. O [procedimento operacional](../operacao/conta-individual-clientes.md) orienta a conferência e os limites de retorno.
