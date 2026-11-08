# Publicação — Bar e Mensalistas — 05/11/2026

A revisão [#69](https://github.com/gustavodrager/longbeach/pull/69) foi publicada em **05/11/2026 às 21:00:44 (Brasília)**. Fonte `cb4a42d9b0ebeb8e02f73bfcdeb3b4db7c35d5df`, branch `codex/bar-produtos-venda-20261105`, Production `42128261813/1`. O [registro da publicação](release-bar-mensalistas-2026-11-05.json) identifica os artefatos e as verificações finais.

No Bar, a entrega inclui exclusão lógica de produtos com preservação do histórico, opção de disponibilidade para venda, botão **Salvar**, retirada da ação de preparo, nome do cliente no título da comanda e cancelamento com motivo obrigatório e as restrições financeiras existentes. Mensalistas permite selecionar várias preferências musicais opcionais no cadastro do grupo.

Foram publicados a API oficial e o frontend oficial, sem recompilação local. As migrations aditivas 34 e 35 acrescentaram a disponibilidade dos produtos e o estado de cancelamento das comandas. Todos os produtos existentes receberam disponibilidade inicial; nenhum produto foi excluído nem comanda cancelada pela publicação. O preflight instalado admite o schema 35.

Passaram 1.359 testes da interface e o build. Em cada matriz PostgreSQL 17 e 18, passaram 719 testes unitários e 716 integrações do servidor. Também passaram as verificações Go e de implantação. Uma condição de corrida no teste da agenda foi corrigida para aguardar o término da consulta, mantendo suas verificações; a fonte anterior `7bf7935` não foi promovida.

O ensaio restaurou uma cópia recente real em PostgreSQL local isolado, conferiu rollback transacional das duas migrations e recusa de repetição. Durante a janela de corte, os escritores foram pausados, uma cópia final privada foi integralmente lida e todas as linhas, sequências, permissões, credenciais e vínculos existentes foram comparados antes e depois das migrations. O ensaio recente e a comparação da cópia congelada são evidências distintas; não se afirma restauração local da mesma cópia final.

A API voltou saudável e manteve os quatro donos confirmados, as contas e os acessos da equipe. PostgreSQL e proxy conservaram seus containers; a integração existente foi retomada no mesmo container, com a mesma imagem e sessão. Configurações do Google e da aplicação foram preservadas.

O Hosting entregou 111 arquivos da aplicação e 113 ativos, incluindo os dois arquivos preservados do provedor. Passaram **132 verificações públicas**, sem falhas: arquivos por conteúdo, 13 rotas, saúde/opções da API e quatro verificações de bloqueio anônimo. No navegador, o aviso **Atualização disponível** levou ao novo arquivo `index-BzLCjAvL.js` após **Atualizar agora**.

A janela da VM foi encerrada e sua lease removida. Foi removida somente a política temporária `65680131`, com a política original `64559591`, os revisores e as demais proteções conferidos. Os ambientes temporários locais e a aba de teste foram encerrados. As cópias privadas e os comprovantes ficam fora do Git, na pasta de evidências desta revisão.

Após usar o schema 35, qualquer retorno deve manter uma API compatível e preservar os dados novos. Não executar Down, promover a API antiga com schema 33 ou restaurar uma cópia sobre produção automaticamente.
