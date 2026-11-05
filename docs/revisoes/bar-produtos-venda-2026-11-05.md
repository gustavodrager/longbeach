# Bar: produtos, vendas e comandas

O cadastro e a edição de cada produto passam a ter **Disponível para venda**, marcado inicialmente. Desmarcar retira o produto das opções de venda do atendimento e do pedido pelo QR Code. O produto permanece no cadastro e pode continuar como ingrediente de uma ficha técnica. A lista identifica **Fora da venda**.

Ao editar, a ação **Excluir produto** pede uma confirmação curta. A exclusão retira o produto do cadastro ativo, preservando vendas, movimentações e versões de receitas. O sistema recusa a exclusão enquanto houver saldo ou reserva de estoque, compra ou inventário pendente, atendimento aberto ou uso como ingrediente de uma receita ativa. A mensagem informa o que precisa ser resolvido; nenhuma pendência é cancelada automaticamente.

## Salvar a venda

A venda avulsa usa somente **Salvar**; foi retirada a alternativa **Enviar para preparo**. Para quem já possui permissão de entrega, salvar registra a entrega dos itens, inclusive preparados, e encaminha ao recebimento quando esse acesso estiver habilitado. O pagamento continua exigindo confirmação na tela própria. A receita e a baixa de ingredientes são preservadas, sem gerar uma etapa de preparo para a nova venda avulsa.

As permissões de entrega e recebimento não foram ampliadas. Comandas compartilhadas, pedidos pelo QR Code e registros antigos conservam seu fluxo; uma tentativa de venda ainda sem confirmação repete a mesma operação original, sem trocar sua modalidade nem baixar estoque duas vezes.

## Identificação no título

Quando houver identificação, o título apresenta **Comanda 01 - Cliente Exemplo**, usando o nome do cliente ou o nome manual informado na comanda. O nome do responsável financeiro não substitui a identidade do cliente. Sem identificação, permanece somente o número; antes de a venda receber um número, aparece **Vender - Cliente Exemplo**. Os títulos usam os dados já recebidos pela interface, sem ampliar consultas ou permissões.

## Cancelar comanda

A supervisão pode **Cancelar comanda**, informando um motivo obrigatório, mantido com o responsável e a data no histórico. O cancelamento conserva o consumo e os pagamentos anteriores e encerra o acesso pelo QR Code.

Itens ainda solicitados são recusados; itens aceitos e ainda não entregues têm sua reserva liberada. Itens entregues são retirados da cobrança sem voltar automaticamente ao estoque. Essa consequência aparece na confirmação; se houve devolução física, ela deve ser registrada na correção dos itens antes do cancelamento. Valores recebidos, pagamentos e estornos pendentes precisam ser resolvidos pelas ações já existentes antes de cancelar. O cancelamento não faz estorno automático.

Descontos e cortesias dos itens cancelados deixam de compor o cálculo, com evento explícito no histórico, preservando a concessão original. Na correção de itens já autorizada, a concessão é limitada ao consumo restante e a diferença também é registrada; recebimentos e pendências continuam impedindo redução indevida da cobrança.

## Comportamento preservado

- Pedidos já aceitos continuam disponíveis para entrega e pagamento. Repetir uma operação confirmada conserva seu resultado original.
- Um produto fora da venda continua disponível para compra, estoque e composição de outros produtos. A opção não altera saldo, custo ou preço.
- Novas vendas e novos pedidos também são bloqueados pela API, inclusive se o cliente estiver com uma lista antiga aberta. Os catálogos de atendimento e QR Code são atualizados durante o uso.
- O cardápio de apresentação publicado mantém seu fluxo próprio de edição e publicação. A alteração de um produto não republica esse documento automaticamente.
- A consulta de receitas históricas continua disponível após excluir o produto preparado, sem permitir novas versões para um produto excluído.
- As permissões atuais de cadastro e estoque são mantidas. A equipe do Bar não recebe novas permissões administrativas.

## Atualização do banco

Migration aditiva `20261105215807_BarProductSaleAvailability` acrescenta `AvailableForSale` em `bar_products`, com valor inicial verdadeiro para os cadastros existentes. A exclusão é lógica; não remove linhas nem relacionamentos. A reversão do campo é recusada enquanto houver produtos fora da venda, para não liberar vendas por uma versão antiga da API.

Migration aditiva `20261105223240_BarTabCancellation` permite o estado `Cancelled` na restrição de `bar_tabs`, preservando as demais regras. A reversão é recusada se já houver comanda cancelada. Não cria tabelas ou colunas adicionais. O contrato de compatibilidade da API passa a exigir as **35 migrations**, sem reescrever as anteriores.

Clientes antigos da API podem omitir a nova opção ao editar: a disponibilidade atual é preservada. O formato anterior de repetição das operações de estoque também é conservado.

## Validação e publicação

Os testes cobrem disponibilidade, ingredientes, pedidos aceitos, repetição de operações, exclusão, pendências, concorrência, autorização e atualização do banco. A revisão da interface inclui confirmação, recuperação de erro, preservação da edição e consulta histórica. Resultados e prévias ficam em `evidencias/bar-produtos-venda-2026-11-05/`, fora do repositório da aplicação.

O limite de duração do lote oficial do servidor passa de 30 para 45 minutos. A suíte completa com PostgreSQL 18 já levou 28 minutos de testes, além da preparação, e a entrega acrescenta cenários e migrations. Os comandos, as duas versões de PostgreSQL e as verificações permanecem iguais; a margem permite concluir o lote.

Esta entrega altera **interface, API e banco**. Não está incluída na autorização da publicação da Visão Geral (#68); sua publicação exige aprovação específica da nova versão.

Validação consolidada com as preferências musicais de Mensalistas: **1.359 testes da interface em 111 arquivos aprovados** e build TypeScript/Vite/PWA aprovado. Os 347 arquivos da interface permaneceram iguais entre o início e o fim dessa rodada. A conferência do contrato de implantação passou em **34 testes locais**. A futura publicação deve aplicar as migrations e promover a API compatível antes da interface.

Resultado do servidor: **719 testes unitários aprovados**, **204 integrações afetadas do Bar e acessos** e **10 integrações de Mensalistas** aprovadas em PostgreSQL 18 local, sem falhas ou testes ignorados. Build da solução combinado aprovado sem avisos ou erros. Os testes e as prévias usam apenas dados fictícios, sem conexão com o banco de produção.

Prévias em 1440 × 1000 e 390 × 844, sem transbordamento horizontal nem erros de JavaScript, incluem produtos, Salvar, identificação no título e cancelamento. Desmarcar a venda preservou o saldo; a recusa da exclusão manteve a edição. Nomes longos permanecem legíveis. Os bancos locais temporários foram removidos. A revisão das regras de venda, estoque, cancelamento, permissões e identidade foi conferida por outro agente, com os achados corrigidos antes da validação final.
