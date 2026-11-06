# Produtos disponíveis nas vendas e comandas

O seletor de produtos do atendimento removia da lista os itens com saldo inferior a uma unidade, antes de aplicar busca, categorias e favoritos. Por isso, um produto habilitado para venda podia desaparecer completamente da tela.

Vendas avulsas e inclusão em comandas agora mostram todos os produtos retornados pelo catálogo autorizado da API. Os produtos sem saldo aparecem com aviso e acréscimo bloqueado; produtos sem controle de estoque continuam permitindo inclusão no rascunho. A busca por nome completo ou nome no PDV, as categorias e os favoritos incluem os itens sem saldo.

A API continua excluindo produtos inativos, desabilitados para venda ou sem preço de venda positivo. O estoque próprio e o estoque dos ingredientes continuam sendo conferidos no servidor. O cardápio do cliente conserva seu comportamento atual. Não há alteração funcional no servidor, migration, ajuste de saldo ou mudança de acessos.

Validação local:

- 1.369 testes da interface em 112 arquivos aprovados; os 10 novos testes passaram novamente após um ajuste de tipagem das consultas acessíveis.
- Build TypeScript/Vite/PWA aprovado.
- 12 integrações de disponibilidade de produtos aprovadas em PostgreSQL 18 local com dados fictícios, incluindo catálogo com saldo zero, produto sem controle, disponibilidade por ingredientes, produtos ocultos e rejeição de consumo sem saldo.
- Venda avulsa e comanda aberta testadas sem registrar vendas reais. O banco temporário de teste foi removido.

Comprovantes locais privados em `evidencias/bar-catalogo-venda-2026-11-05/`. A entrega de produção desta correção envolve somente a interface; a autorização anterior da revisão #69 corresponde à versão já publicada.
