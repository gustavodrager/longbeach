# Bar: navegação unificada

A operação do Bar usa uma área contínua, com identidade Long Beach. No celular e tablet em pé, a barra inferior reúne Vender, Comandas, Pedidos e Caixa. Mais abre Produtos e estoque, Compras e Resumo. No desktop, as mesmas entradas aparecem na lateral. Cada entrada respeita as permissões efetivas; um atendente não recebe controles de gestão por usar o mesmo menu.

## Produtos e estoque

A rota /bar/produtos reúne a listagem editável e o saldo disponível. Quem tem somente leitura de estoque recebe a visualização de saldos, sem cadastro ou edição de preços. Todos, Repor e Esgotados filtram a listagem; itens sem controle não são tratados como esgotados. Contagem, recebimento de compras, perdas/consumo e movimentações ficam em Ações de estoque. Fichas técnicas são acessadas nas opções do produto preparado.

O endereço antigo /bar/estoque direciona a lista para Produtos e estoque. /bar/estoque?secao=movimentos preserva a consulta auditada. Inventários e demais históricos permanecem acessíveis, sem alteração dos cálculos ou das regras de aprovação.

## Caixa

/bar/caixa é a entrada única. /atendimento/caixa redireciona preservando parâmetros. Atendentes mantêm o controle do próprio turno; supervisores veem o turno atual e podem acessar Histórico. O histórico só é consultado ao abrir essa seção, com filtro por responsável/situação. Abertura, movimentações, fechamento, diferenças e reabertura mantêm as permissões e validações existentes.

## Compras e registros secundários

Compras mantém Nova compra, Importar nota e indicadores de recebimento. O fornecedor é cadastrado dentro da compra, evitando o botão duplicado. A importação continua na área fiscal da Arena, com as permissões originais; o recebimento continua separado da importação para evitar duplicidade.

Vendas do fluxo anterior ficam acessíveis nas Comandas encerradas/todas e nos registros do Resumo. A conciliação antiga do Bar fica no Financeiro, identificada separadamente da conciliação PagBank. Nenhum registro histórico foi excluído.

## Validação

Testes de navegação por perfil, filtros de estoque, edição de produtos, caixa e demais fluxos do Bar. Builds da API e frontend. Conferência visual em dados fictícios nos tamanhos 320, 390, 800×1280, 1280×800 e desktop. Sem migration, mudanças de contrato ou publicação automática nesta etapa. A conferência no Redmi físico permanece necessária antes da entrada em operação.
