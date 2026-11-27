# Nome da comanda após a abertura

## Problema corrigido

A abertura aceitava um nome livre, mas a alteração posterior oferecia somente a busca e o vínculo com um cliente cadastrado. O texto digitado na busca não integrava o pedido de identificação; sem selecionar um cliente, a tela podia confirmar uma operação vazia e deixar a comanda sem nome.

O nome da comanda passa a ter uma edição explícita. Ele identifica a pessoa, mesa ou grupo sem exigir cadastro ou telefone. A identificação cadastral continua sendo uma operação separada, assim como a atribuição de responsabilidade financeira.

No detalhe da comanda, usar **Adicionar nome** ou **Editar nome**, preencher **Nome do cliente ou grupo (opcional)** e confirmar em **Salvar nome**. As ações **Vincular cliente cadastrado** e **Alterar cliente cadastrado** continuam destinadas ao vínculo cadastral; digitar na busca não equivale a selecionar um cadastro.

## Contrato e persistência

`PUT /api/v1/bar/tabs/{id}/name` recebe `operationId`, `name` e `expectedVersion`, e retorna a comanda confirmada. Exige sessão com `bar:sales:operate`; funcionários também precisam de ação permitida em Vender ou Comandas.

- O nome é obrigatório no pedido, mas pode ser uma string vazia para remover a identificação livre. Espaços nas extremidades são removidos e o limite existente de 80 caracteres é preservado.
- Somente comandas abertas podem ser renomeadas. O controle de versão recusa uma alteração baseada em dados antigos com `409`; não sobrescreve silenciosamente a edição de outra pessoa.
- A operação usa transação, bloqueio da comanda e a idempotência existentes. Repetir a mesma chave e o mesmo conteúdo recupera a resposta confirmada. A chave não pode ser reutilizada para outra alteração.
- Uma mudança efetiva incrementa a versão e registra `NameChanged`, com o operador, na mesma transação. A auditoria de persistência existente permanece ativa. O texto do nome não é copiado para o motivo do histórico nem para logs técnicos.
- Cliente cadastrado, responsável financeiro, acesso por QR, consumos, estoque, descontos, pagamentos e saldos permanecem preservados. Um Pix pendente não impede mudar somente o nome.
- A consulta, o título e a busca por nome usam o valor persistido. Quando o nome livre está vazio, o título conserva o comportamento existente de usar o nome cadastral, caso haja vínculo.

O contrato de `PUT /customer`, seu fingerprint e suas confirmações antigas não mudam. Não há migration: a alteração usa a coluna de nome já existente.

## Confirmação no dispositivo

O editor conserva a operação por usuário e comanda enquanto aguarda a resposta. Em uma falha de conexão, a confirmação é retomada com a mesma chave, nome e versão. A tentativa tem tempo limitado e não cria bloqueio de vendas ou pagamentos por uma pendência exclusiva do nome.

Um conflito de versão atualiza a consulta, conserva o texto digitado e requer nova confirmação explícita. O sucesso só é informado após resposta da API. A busca cadastral não salva um nome livre e não confirma alteração quando nenhum vínculo foi modificado.

A versão usada na edição fica fixada ao abrir o formulário. Uma consulta automática durante a digitação não substitui essa base. Depois de um conflito, a leitura de recuperação também tem prazo de 15 segundos; se ela falhar, a tela oferece atualizar a comanda novamente e preserva o nome digitado.

## Validação local em 27/11/2026

- **206 testes de frontend aprovados**, sem falhas ou ignorados: editor de nome, atendimento, ações por permissão, cancelamento, liquidação e recuperação de venda direta. Os 20 novos cenários do editor incluem os casos que falhavam sem a ação de adicionar nome, remontagem, busca, repetição da mesma operação, conflitos sucessivos, consultas interrompidas, troca de usuário e preservação das ações de supervisão.
- **88 testes de backend aprovados**, sem falhas ou ignorados: 23 unitários, 63 de integração/escopo e dois cenários existentes de identificação cadastral. Os testes de persistência e de API usaram PostgreSQL 18 local, com dados sintéticos.
- API e bibliotecas compiladas; frontend verificado por TypeScript e build Vite/PWA. Sem alteração de dependências ou migration.

O arquivo `BarTabsNamePostgresTests.cs` estende a classe parcial `BarTabsPostgresTests`; filtros de teste devem usar o nome da classe ou dos métodos, não o nome do arquivo. O CI continua responsável pela suíte completa no commit da PR e nos artefatos de publicação.

## Publicação conjunta

Esta correção deve compor o mesmo pacote da recuperação de vendas diretas integrada pela PR #93. A release de imagens #59 contém apenas a recuperação anterior; não contém este incremento de nome.

Promover a API com o novo endpoint antes do frontend que o utiliza. O frontend anterior continua compatível com a API nova. Preservar armazenamento do navegador e confirmações pendentes durante a atualização. Não limpar dados dos tablets para atualizar a aplicação.

Não executar migration nem recriar o banco. A publicação segue os gates existentes de CI, aprovação do environment e artefatos por commit/digest. O estado real de produção deve ser registrado no recibo de implantação; integrar o código ou gerar imagens não significa que a aplicação publicada já mudou.
