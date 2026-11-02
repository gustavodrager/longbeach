# Conta individual do cliente

## Entrega

O cliente pode usar Google, usuário e senha ou ambos na mesma conta. O cadastro público com senha solicita nome, telefone, usuário e confirmação da senha; e-mail é apenas contato opcional. O cadastro Google solicita os contatos e a entrada de um Cliente Google com ficha incompleta conduz ao perfil. A equipe conserva seu direcionamento e seu único perfil.

Na ficha, **Vínculos e acesso → Conta de acesso** apresenta a situação e mantém as ações de gestão recolhidas. O Gestor confirma a identidade antes de emitir um link e QR Code de ativação, válido por sete dias. A ativação utiliza a ficha existente, sem criar usuários em massa. A recuperação assistida dura trinta minutos, atende somente contas Cliente e encerra as sessões anteriores. A equipe não recebe a senha escolhida pelo cliente.

Dependentes usam autorização explícita de responsável, com versão e revogação. A revogação impede acesso à agenda mesmo quando há vínculo antigo do portal, cobrança escolar ou reserva remarcada. Obrigações financeiras e seus responsáveis permanecem separados. Contas locais ativas e com primeiro acesso concluído também podem ser selecionadas no bar e nas associações administrativas.

## Integridade e configuração

- Conta e cadastro são associados em transação; nomes, telefones e e-mails semelhantes não concedem identidade nem histórico.
- Convites e recuperação têm segredo aleatório de 256 bits, persistido somente como hash. Expiração, consumo, revogação, cadastro, versão e associação são conferidos no servidor. Reemissão invalida links anteriores e não armazena resposta com o segredo.
- O navegador retira o segredo do fragmento do endereço e o conserva somente em memória. Respostas antigas não restauram sessão após sair, trocar de conta ou abrir outro convite.
- Acrescentar um método exige nova comprovação de acesso. Falhas nessa confirmação não são tratadas como sessão expirada nem provocam repetição automática da alteração.
- `CredentialVersion` é conferida nas requisições e na renovação. Recuperação e alterações de credenciais invalidam JWTs e refresh tokens anteriores, inclusive em concorrência. Tokens legados sem versão conservam o valor inicial zero.
- O login local tem padrão habilitado; o autocadastro local fica **fechado quando sua flag está ausente**. A interface usa as capacidades confirmadas pelo servidor, independentemente da disponibilidade do Google.
- A migration aditiva `20261102163528_ClientIndividualAccess` prepara o schema 32, grants limitados e proteção de histórico contra downgrade. Não reescreve migrations antigas, cria contas em massa ou altera perfis.

O [ADR-021](../adr/ADR-021-conta-individual-clientes.md) registra as decisões e o [procedimento operacional](../operacao/conta-individual-clientes.md) descreve ativação, recuperação, conferência e implantação.

## Validação local

- **649 testes unitários do servidor** aprovados, sem falhas ou testes ignorados.
- **595 cenários distintos de integração** validados em PostgreSQL 17, considerando a execução completa e as repetições justificadas abaixo.
- **92 testes afetados** aprovados também com PostgreSQL 18.6, incluindo cadastro, métodos, migration, responsáveis, Google, sessões, primeiro acesso, bar e portal; sem falhas ou testes ignorados.
- **1.111 testes da interface em 97 arquivos** aprovados, além de TypeScript e build Vite/PWA.
- **28 testes do contrato de compatibilidade da VM** aprovados, incluindo o novo conjunto real de 32 migrations.
- Compilação da solução .NET aprovada, sem avisos ou erros. Revisões independentes de identidade, sessões, convites, responsáveis, interface e migration concluídas.

A primeira suíte completa de integração executou 593 casos: 590 passaram e três expectativas antigas falharam. Duas comparavam exatamente as opções de autenticação anteriores; a outra usava a migration penúltima para testar o bloqueio de remoção do histórico de comunicação. Essas expectativas foram atualizadas para as novas opções e para a migration anterior à comunicação. Os 35 casos afetados passaram na repetição; 17 testes finais de autorização passaram, incluindo dois casos novos da flag de senha local. O comprovante privado agrega resultados por identificador de teste, preserva a primeira execução e registra a aprovação final dos 595 cenários. Isso não representa uma única execução completa sem falhas iniciais.

Os testes abrangem cadastro transacional, colisões, conta sem Google no bar, convite expirado/revogado/reemitido/usado ou consumido simultaneamente, manutenção de identidade, recuperação com bloqueio/troca de perfil, sessão antiga e versões concorrentes. Também verificam responsáveis após unificação, revogação com cobrança e reserva vinculadas, grants restritos e atualização 31→32 preservando os valores anteriores de usuário, cliente e refresh token. O downgrade foi recusado após alterações de credenciais, desabilitação da senha local, autorização revogada e desafio já consumido.

## Prévia no navegador

O ensaio usou somente pessoas fictícias e API, interface e PostgreSQL locais:

- Cadastro público sem Google, entrada, saída e sessão após recarregar.
- Emissão de convite pelo Gestor, apresentação de link e QR Code, ativação, entrada da conta convidada e ficha anterior preservada.
- Conferência por leitura: três clientes, três contas, convite consumido, nenhuma duplicação e associação da conta convidada à ficha original.
- Login e cadastro em 390 × 844 sem transbordamento horizontal; controles de pelo menos 48 px, ação principal do login visível, foco por teclado e abertura/fechamento da ajuda. Tamanho normal do navegador restaurado.

Na preparação da prévia, o catálogo de perfis fictícios precisou ser inicializado explicitamente, pois as tarefas de inicialização estavam desativadas. A suíte completa também recriou seu próprio banco em um teste legado; o ensaio foi retomado em outro banco local exclusivo e a ativação foi repetida com sucesso. Esses acontecimentos e os registros originais permanecem nos comprovantes privados, sem serem apresentados como falhas de regra do cadastro.

O Google real esteve desativado na prévia. Os testes do servidor verificam Google com credenciais assinadas fictícias e validação de identidade; não houve login OAuth real, concessão de acesso ou cadastro em produção. Capturas e comprovantes ficam em `evidencias/conta-cliente-2026-11-02/`, fora do repositório da aplicação.

## Implantação

**Não publicado.** A entrega exige API, interface e migration do banco. A conferência das pessoas reais ainda não foi executada. O relatório administrativo somente leitura `GET /api/v1/customers/access-review` foi preparado para apontar vínculos ausentes, contatos compartilhados, cadastros incompletos e responsáveis a conferir, sem associar ou promover contas automaticamente.

A publicação e a habilitação do autocadastro local dependem de autorização específica, conferência e plano de implantação. Não foram alterados o cadastro OAuth, flags hospedadas, banco, permissões ou serviços de produção. Os dois arquivos locais anteriores de outra operação foram preservados.
