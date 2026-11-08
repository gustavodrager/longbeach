# Publicação — catálogo de vendas e comandas — 05/11/2026

A revisão [#70](https://github.com/gustavodrager/longbeach/pull/70) foi publicada em **05/11/2026 às 22:05:33 (Brasília)**. Fonte `31544206317def70e0f99b70f5a11b84ff1401c6`, branch `codex/bar-catalogo-venda-20261105`, Production `42136974549/1`. O [registro da publicação](release-bar-catalogo-2026-11-05.json) identifica os artefatos e as verificações finais.

Vendas avulsas e inclusão em comandas passam a mostrar todos os produtos retornados pelo catálogo autorizado. Produtos sem saldo ficam visíveis com aviso e acréscimo bloqueado; produtos sem controle de estoque continuam disponíveis. Busca, categorias e favoritos incluem os produtos sem saldo. As regras de estoque e as restrições da API foram preservadas.

Foi publicada somente a interface oficial, com proveniência e SBOM, sem recompilação local. Esta operação não implantou API nem alterou banco, credenciais, perfis, acessos ou configuração do Google. Saúde e opções públicas da API foram comparadas com a captura atual por hash.

Passaram 1369 testes locais da interface, o build TypeScript/Vite/PWA e 12 integrações de disponibilidade em PostgreSQL local com dados fictícios. CI e os cinco jobs de Production foram aprovados na fonte exata. A conferência de infraestrutura da PR não se aplicava ao diff desta revisão; essa condição foi verificada pelo conteúdo Git imutável.

O Hosting entregou 111 arquivos da aplicação e 113 ativos, incluindo os dois arquivos preservados do provedor. Passaram **132 verificações públicas**, sem falhas: arquivos por conteúdo, 13 rotas, saúde/opções da API e quatro bloqueios anônimos de APIs privadas. O aviso de atualização do aplicativo levou ao arquivo `/assets/index-D4mimlHu.js` após Atualizar agora.

Foi removida somente a política temporária `65684600`. As políticas originais, os revisores e as demais proteções foram conferidos e preservados. A aba de teste foi encerrada. Os quatro arquivos locais preexistentes acompanhados nesta operação permaneceram intactos. Os comprovantes privados ficam fora do Git, na pasta de evidências da revisão.
