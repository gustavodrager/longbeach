# Produtos do Bar: venda e exclusão

O cadastro e a edição de cada produto passam a ter **Disponível para venda**, marcado inicialmente. Desmarcar retira o produto das opções de venda do atendimento e do pedido pelo QR Code. O produto permanece no cadastro e pode continuar como ingrediente de uma ficha técnica. A lista identifica **Fora da venda**.

Ao editar, a ação **Excluir produto** pede uma confirmação curta. A exclusão retira o produto do cadastro ativo, preservando vendas, movimentações e versões de receitas. O sistema recusa a exclusão enquanto houver saldo ou reserva de estoque, compra ou inventário pendente, atendimento aberto ou uso como ingrediente de uma receita ativa. A mensagem informa o que precisa ser resolvido; nenhuma pendência é cancelada automaticamente.

## Comportamento preservado

- Pedidos já aceitos continuam disponíveis para entrega e pagamento. Repetir uma operação confirmada conserva seu resultado original.
- Um produto fora da venda continua disponível para compra, estoque e composição de outros produtos. A opção não altera saldo, custo ou preço.
- Novas vendas e novos pedidos também são bloqueados pela API, inclusive se o cliente estiver com uma lista antiga aberta. Os catálogos de atendimento e QR Code são atualizados durante o uso.
- O cardápio de apresentação publicado mantém seu fluxo próprio de edição e publicação. A alteração de um produto não republica esse documento automaticamente.
- A consulta de receitas históricas continua disponível após excluir o produto preparado, sem permitir novas versões para um produto excluído.
- As permissões atuais de cadastro e estoque são mantidas. A equipe do Bar não recebe novas permissões administrativas.

## Atualização do banco

Migration aditiva `20261105215807_BarProductSaleAvailability` acrescenta `AvailableForSale` em `bar_products`, com valor inicial verdadeiro para os cadastros existentes. A exclusão é lógica; não remove linhas nem relacionamentos. O contrato de compatibilidade da API passa a exigir as 34 migrations, incluindo esta alteração. A reversão do campo é recusada enquanto houver produtos fora da venda, para não liberar vendas por uma versão antiga da API.

Clientes antigos da API podem omitir a nova opção ao editar: a disponibilidade atual é preservada. O formato anterior de repetição das operações de estoque também é conservado.

## Validação e publicação

Os testes cobrem disponibilidade, ingredientes, pedidos aceitos, repetição de operações, exclusão, pendências, concorrência, autorização e atualização do banco. A revisão da interface inclui confirmação, recuperação de erro, preservação da edição e consulta histórica. Resultados e prévias ficam em `evidencias/bar-produtos-venda-2026-11-05/`, fora do repositório da aplicação.

Esta entrega altera **interface, API e banco**. Não está incluída na autorização da publicação da Visão Geral (#68); sua publicação exige aprovação específica da nova versão.

Resultado da interface: **1.297 testes em 108 arquivos aprovados**, incluindo os cenários novos, e build TypeScript/Vite/PWA aprovado. A conferência do contrato de implantação passou em **34 testes locais**. A futura publicação deve aplicar a migration e promover a API compatível antes da interface, para que a opção de venda seja respeitada desde sua disponibilização.

Resultado do servidor: **699 testes unitários aprovados**, **166 integrações afetadas aprovadas** e **30 integrações da rodada final aprovadas** em PostgreSQL 18 local, com sobreposição entre as duas rodadas. Não houve falhas nem testes ignorados. Builds da solução em Debug e Release passaram sem avisos ou erros. Os testes e a prévia usam apenas dados fictícios, sem conexão com o banco de produção.

Prévia aprovada em 1440 × 1000 e 390 × 844, sem transbordamento horizontal nem erros de JavaScript. Desmarcar a venda preservou o saldo; a recusa da exclusão manteve a edição para correção. Após esclarecer a frase sobre saldo em estoque, os **25 testes afetados** e o build passaram novamente. O servidor da prévia foi encerrado e o banco local temporário foi removido.
