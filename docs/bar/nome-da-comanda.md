# Nome da comanda após a abertura

## Problema corrigido

A abertura aceitava um nome livre, mas a alteração posterior oferecia somente a busca e o vínculo com um cliente cadastrado. O texto digitado na busca não integrava o pedido de identificação; sem selecionar um cliente, a tela podia confirmar uma operação vazia e deixar a comanda sem nome.

O nome identifica a pessoa, mesa ou grupo sem exigir cadastro ou telefone. O campo de identificação permite salvar esse texto livre ou selecionar um cliente cadastrado. Essas escolhas continuam sendo operações distintas na API, assim como a atribuição de responsabilidade financeira.

## Identificar ou alterar a comanda

Na comanda sem identificação, usar **Identificar comanda**. Quando já há nome livre ou cliente vinculado, a ação é **Alterar identificação**.

- No campo **Cliente da comanda**, digitar de 1 a 80 caracteres após remover os espaços das extremidades e confirmar em **Salvar identificação**. Um nome de um único caractere já é válido; não é necessário selecionar um resultado, cadastrar a pessoa ou informar telefone.
- A consulta de clientes começa com três caracteres e serve apenas para sugerir cadastros existentes. Falha de consulta ou ausência de resultados não impede salvar o nome livre.
- Campo vazio ou somente com espaços não envia alteração por esse fluxo, inclusive ao pressionar Enter. Para remover explicitamente um nome livre, usar o editor **Editar nome**, deixar seu campo vazio e confirmar em **Salvar nome**.
- Selecionar um cadastro mantém o fluxo de vínculo existente: **Salvar identificação** envia o `customerId` escolhido. Digitar um nome livre envia somente o nome da comanda; não cria nem altera o cadastro da pessoa.
- Se já há um cliente vinculado, o cartão desse cliente permanece visível. **Trocar cliente** abre o campo para outra escolha. Esse clique não salva nada; digitar um nome livre e salvar preserva o vínculo cadastral original. **Continuar sem identificar** seguido de **Salvar identificação** continua sendo a ação explícita para remover o vínculo cadastral.

Os atalhos **Adicionar nome** e **Editar nome**, com o campo **Nome do cliente ou grupo (opcional)** e a ação **Salvar nome**, continuam disponíveis conforme o contexto da tela. Eles e o campo de identificação compartilham a mesma confirmação de alteração de nome.

## Contrato e persistência

`PUT /api/v1/bar/tabs/{id}/name` recebe `operationId`, `name` e `expectedVersion`, e retorna a comanda confirmada. Exige sessão com `bar:sales:operate`; funcionários também precisam de ação permitida em Vender ou Comandas.

- O nome é obrigatório no pedido, mas o contrato da API continua aceitando uma string vazia para remover a identificação livre pelo editor explícito. Espaços nas extremidades são removidos e o limite existente de 80 caracteres é preservado. O fluxo **Salvar identificação** exige ao menos um caractere após essa normalização.
- Somente comandas abertas podem ser renomeadas. O controle de versão recusa uma alteração baseada em dados antigos com `409`; não sobrescreve silenciosamente a edição de outra pessoa.
- A operação usa transação, bloqueio da comanda e a idempotência existentes. Repetir a mesma chave e o mesmo conteúdo recupera a resposta confirmada. A chave não pode ser reutilizada para outra alteração.
- Uma mudança efetiva incrementa a versão e registra `NameChanged`, com o operador, na mesma transação. A auditoria de persistência existente permanece ativa. O texto do nome não é copiado para o motivo do histórico nem para logs técnicos.
- Cliente cadastrado, responsável financeiro, acesso por QR, consumos, estoque, descontos, pagamentos e saldos permanecem preservados. Um Pix pendente não impede mudar somente o nome.
- A consulta, o título e a busca por nome usam o valor persistido. Quando o nome livre está vazio, o título conserva o comportamento existente de usar o nome cadastral, caso haja vínculo.

O contrato de `PUT /customer`, seu fingerprint e suas confirmações antigas não mudam. Alterar o vínculo cadastral continua bloqueado enquanto há pagamento pendente; isso não impede salvar somente um nome livre. Não há migration: a alteração usa a coluna de nome já existente.

## Confirmação no dispositivo

O editor conserva a operação por usuário e comanda enquanto aguarda a resposta. Os dois pontos de entrada usam o mesmo checkpoint `tab-name-v1`; as confirmações cadastrais continuam usando `tab-customer`. Em uma falha de conexão, a confirmação de nome é retomada com a mesma chave, nome e versão. Durante a edição da identificação, a ação passa a **Conferir identificação**; após recarregar, o editor oferece **Conferir nome** para a mesma operação preservada. A tentativa tem tempo limitado e não cria bloqueio de vendas ou pagamentos por uma pendência exclusiva do nome.

Um conflito de versão atualiza a consulta, conserva o texto digitado e requer nova confirmação explícita com outra chave. O sucesso só é informado após resposta da API. Digitar, consultar ou selecionar uma opção não salva automaticamente: a confirmação explícita determina se será enviado o nome livre ou o vínculo cadastral. Caso existam confirmações antigas dos dois tipos, elas permanecem separadas e podem ser conferidas sem reinterpretar seus dados.

A versão usada na edição fica fixada ao abrir o formulário. Uma consulta automática durante a digitação não substitui essa base. Depois de um conflito, a leitura de recuperação também tem prazo de 15 segundos; se ela falhar, a tela oferece atualizar a comanda novamente e preserva o nome digitado.

## Cobertura do fluxo de identificação

As regressões de `TabNameEditor.test.tsx` cobrem nome de um caractere, normalização, limite de 80, espaços e Enter sem envio, consulta cadastral sem resultado ou indisponível, preservação de cadastro e responsável com Pix pendente, resposta perdida e recarregamento, conflito de versão, atualização em segundo plano e recuperação conjunta dos checkpoints de nome e cadastro.

Os testes existentes de identificação cadastral mantêm seleção, remoção do vínculo e replay de `PUT /customer`. As verificações de permissões e de comanda cancelada continuam exigindo ausência das ações de edição para quem não pode operá-las.

Validação local do incremento em 27/11/2026: **199 testes aprovados em cinco arquivos**, sem falhas ou ignorados, incluindo 33 cenários de nome/identificação. TypeScript e o build Vite/PWA também passaram. A revisão independente verificou as confirmações simultâneas de nome e cadastro, inclusive checkpoint de nome ilegível e vínculo rejeitado, sem perder o acesso à recuperação.

### Histórico da validação inicial do endpoint em 27/11/2026

Os resultados abaixo se referem à implementação inicial do endpoint e do editor explícito, anterior à integração do nome livre no campo **Cliente da comanda**. Não representam, por si só, a validação deste novo incremento de interface.

- **206 testes de frontend aprovados**, sem falhas ou ignorados: editor de nome, atendimento, ações por permissão, cancelamento, liquidação e recuperação de venda direta. Os 20 novos cenários do editor incluem os casos que falhavam sem a ação de adicionar nome, remontagem, busca, repetição da mesma operação, conflitos sucessivos, consultas interrompidas, troca de usuário e preservação das ações de supervisão.
- **88 testes de backend aprovados**, sem falhas ou ignorados: 23 unitários, 63 de integração/escopo e dois cenários existentes de identificação cadastral. Os testes de persistência e de API usaram PostgreSQL 18 local, com dados sintéticos.
- API e bibliotecas compiladas; frontend verificado por TypeScript e build Vite/PWA. Sem alteração de dependências ou migration.

O arquivo `BarTabsNamePostgresTests.cs` estende a classe parcial `BarTabsPostgresTests`; filtros de teste devem usar o nome da classe ou dos métodos, não o nome do arquivo. O CI continua responsável pela suíte completa no commit da PR e nos artefatos de publicação.

## Publicação e compatibilidade

O incremento de interface reutiliza `PUT /name` e `PUT /customer`; não exige outro endpoint ou alteração de banco. A API que oferece `PUT /name` deve estar disponível antes de publicar um frontend que o utiliza. O frontend anterior continua compatível com essa API.

Preservar armazenamento do navegador e confirmações pendentes durante a atualização. Não limpar dados dos tablets para atualizar a aplicação.

Não executar migration nem recriar o banco. A publicação segue os gates existentes de CI, aprovação do environment e artefatos por commit/digest. O estado real de produção deve ser registrado no recibo de implantação; integrar o código ou gerar imagens não significa que a aplicação publicada já mudou.
