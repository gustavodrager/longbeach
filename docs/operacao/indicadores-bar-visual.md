# Indicadores do bar — revisão visual de 6 de outubro de 2026

O acesso direto a `/bar/indicadores` usava classes do atendimento sem carregar as folhas de estilo correspondentes. Os cartões apareciam como links corridos, os filtros sem alinhamento e o conteúdo sem os recuos da gestão.

O resumo e o detalhe agora usam o layout, o cabeçalho, os cartões, os estados vazios e a tabela responsiva da gestão. Os estilos dos componentes de atendimento reutilizados são importados explicitamente. A situação atual e os resultados do período têm seções próprias, datas locais e indicação da última atualização. As fontes e a interpretação dos indicadores permanecem acessíveis. Consultas, contratos, cálculos financeiros, permissões e rotas foram preservados.

Validação local: 173 testes frontend; builds da web/PWA e API aprovados. Navegador com dados fictícios em 360, 390, 768 e 1440 px sem transbordamento horizontal; resumo → detalhe → retorno preserva datas. Conferidos período inválido, zero, número negativo, dado indisponível, lista vazia, foco visível e envio do filtro por teclado. Console sem erros. Nenhuma movimentação real foi criada.

Revisão publicada: `97730fb7e5ceef6cd22f1bc3e489e014faa434e0`, CI `37502867550` aprovado nas etapas frontend e backend. Web Railway: deployment `649e9aaa-d554-4608-963b-0f4a11e9999a`, `SUCCESS`. API preservada em `b29dfbd97bc34bc6b22b3b130450bec17f747211`. Endpoints públicos de saúde responderam `ok` e `Healthy`.

O patch de produção continha exclusivamente a troca do commit da web. Variáveis públicas conferidas antes do build; snapshot sincronizado e plano final sem drift. Rollback disponível para a web anterior: deployment `9e15b68d-cffb-46d4-bdf1-7fdff44a9341`, revisão `5384056c8482bf3a1c6131fee389b93edebfcef2`.

Após atualizar a PWA no Chrome, o domínio oficial apresentou o novo resumo e o detalhe de recebimentos. Os totais permaneceram iguais aos consultados antes da publicação; a navegação de retorno funcionou e o console não registrou erros. Verificação em produção somente de leitura.

## Valor do estoque — publicação de 6 de outubro de 2026

Início e Resumo do Bar agora exibem o custo físico registrado, o potencial de venda disponível e o lucro bruto estimado. O resumo acrescenta margem, base comparável, cobertura de custos e composição por produto com busca, filtro de pendências e paginação. A consulta atualiza a cada 30 segundos enquanto a página está aberta e exige `bar:finance:read`. A [regra de avaliação](../arquitetura/valor-estoque-bar.md) documenta reservas, insumos, custo médio, entradas sem custo e a separação entre projeção e lucro realizado.

Artefato publicado: `08e3e9c96b3542d3b48c182b161e38c972a5ba57`. [CI 37523038141](https://github.com/gustavodrager/longbeach/actions/runs/37523038141) aprovado: 147 testes unitários .NET, 171 de integração PostgreSQL, 185 frontend e 11 conversores; builds da API e PWA aprovados. Cobertura específica inclui precisão do custo, produtos sem preço/custo, reservas, custos incompletos no ciclo atual, transferências, esgotamento do saldo e restrições de acesso. A consulta não grava movimentos.

Publicação em sequência, API antes da web:

- API: `16af4d6f-fadd-4189-b17d-5c5bde8f751c`, `SUCCESS`; `/health/ready` respondeu `Healthy`.
- Web: `9c0ccfac-b34e-4970-b20c-58b85b7aedd6`, `SUCCESS`; `/healthz` respondeu `ok`.

Cada patch alterou somente o SHA do serviço correspondente. Snapshots importados e planos conferidos após cada etapa, sem drift. Sem migration nem alteração dos outros serviços. Rollback disponível para `f20cc73d43fff7d6fe1b58318c567aac5bb3bf8f`: API `927a665f-0dce-45e4-b695-412eeb9ef917` e web `3e670832-aab5-4d45-b618-ff07558a6774`.

Validação visual local em 360, 390, 768 e 1440 px sem transbordamento, com pesquisa e foco visível por teclado. Após atualizar a PWA, produção confirmou os novos cartões no Início e no Bar, o atalho entre as telas, as duas páginas da composição e o filtro de custos pendentes. A soma visível dos produtos confere com os cartões; dados faltantes e incompletos aparecem explicitamente. Console sem erros ou avisos na conferência final. Nenhum lançamento financeiro, venda ou movimento de estoque foi criado para teste. Evidência visual e dados reais permanecem fora do Git.

## Fluxo do Bar — melhorias locais de 19 de outubro de 2026

O resumo começa pelas ações Vender, Comandas, Pedidos e Meu caixa e pelos indicadores atuais. Os resultados por período vêm depois, seguidos da avaliação do estoque. Datas inválidas bloqueiam somente os resultados históricos; as consultas atuais e seus detalhes não enviam o intervalo de datas à API. O retorno ao resumo preserva o filtro para correção.

O indicador `low-stock-bar` usa o único local cujo nome normalizado é Bar. Conta produtos ativos com controle de estoque no mínimo ou abaixo, descontando reservas e mantendo a regra existente para receitas. Ausência ou ambiguidade do local gera indisponibilidade, não um zero. `low-stock` permanece disponível como consulta de todos os locais, com explicação de que a contagem é por produto/local. Nenhum saldo é movido ou recalculado por escrita.

No atendimento, a identificação do destino permanece visível, com explicações adicionais em “Sobre este pedido”. O cabeçalho móvel ocupa menos espaço. Os valores de Meu caixa usam cartões que se ajustam à largura, sem separar os centavos; em 320 px, os resumos passam para uma coluna.

Validação local: 358 testes frontend aprovados; 18 testes existentes de comandas em PostgreSQL 17 e dois novos testes de estoque aprovados. Os novos testes usam schemas isolados e cobrem exclusão de outros locais, reservas, saldo ausente, paginação, normalização do nome e cadastro ausente/duplicado. Builds da API e web/PWA aprovados. A restauração dos testes em ambiente restrito emitiu NU1900 ao consultar a auditoria NuGet; a compilação final da API teve zero avisos e erros.

Navegador com API fictícia: desktop e larguras de 390 e 320 px; consulta atual durante período inválido, detalhe do estoque e consulta de todos os locais, rascunho/conferência e ajuda contextual. Sem transbordamento horizontal nas telas verificadas; valores de caixa inteiros em 320 px. Em 390 px, “Atenção agora” começa a aproximadamente 574 px do início, contra aproximadamente 2.042 px antes. Console sem avisos ou erros na conferência final. Evidências fora do Git em `outputs/bar-melhorias-2026-10-19` no workspace principal.

Esta etapa não publicou em produção. Para publicar, promover primeiro a API com suporte a `low-stock-bar` e depois a web, ambas fixadas por commit. Não há migration nova. O rollback da web pode ser feito antes da API; o indicador antigo continua compatível.

## Publicação do fluxo do Bar — 19 de outubro de 2026

Publicação autorizada pelo proprietário. Alterações enviadas na branch `codex/bar-ux-20261019`, com revisão aberta no [PR #37](https://github.com/gustavodrager/longbeach/pull/37), baseada em `codex/mensalistas-ux-20261016`. API e web fixadas no commit `70425bfdde8547c56d92228c727abdd65e603289`. O PR permanece aberto; publicação por commit não depende de integração da branch.

[CI 39222948602](https://github.com/gustavodrager/longbeach/actions/runs/39222948602) aprovada: 339 testes unitários e 298 de integração em PostgreSQL 17 e 18, 358 frontend, 14 conversores, builds, migrations/readiness, auditoria somente leitura e restauração de backup sintético. São 995 testes distintos da aplicação, além dos conversores.

Publicação em sequência:

- API: deployment `6d64b183-9d3f-4c5c-b73a-a1c1e23b18a8`, `SUCCESS` às 08:41:43 UTC. `/health/ready` respondeu `Healthy`, HTTP 200, antes da promoção da web. O novo detalhe `low-stock-bar` foi conferido na sessão de gestão ainda com a interface anterior.
- Web: deployment `1cf01108-711c-47bc-b80d-0f1122da2368`, `SUCCESS` às 08:46:24 UTC. `/healthz` respondeu `ok`, HTTP 200. Bundle servido e ativo no Chrome: `index-DuM-6X0a.js`.
- Cada patch revisado alterou apenas branch/commit do serviço correspondente. Snapshot importado após cada etapa, com planos sem divergências. Configurações além da fonte, nomes de variáveis e domínios comparados com a linha de base e preservados. Os seis serviços ficaram online, sem falhas recentes ou trabalho pendente; banco e serviços auxiliares conservaram seus deployments.

Conferência autenticada em produção:

- Desktop de 1470 px: atualização pelo aviso da PWA preservou a sessão; ações e atenção aparecem no topo. Um período inválido mantém os indicadores atuais disponíveis. O detalhe do estoque abre sem filtro de datas, e o retorno preserva o intervalo inválido para correção. Filtro restaurado ao dia atual ao final.
- O estoque do Bar e a consulta de todos os locais apresentam contagens distintas e explicações de escopo corretas. Nenhum movimento de estoque é criado pela consulta.
- Celular emulado no Chrome: resumo e venda em 390 × 844; caixa, comandas e pedidos em 320 × 844. Sem transbordamento horizontal nas telas verificadas. Produtos visíveis na primeira tela da venda; valores completos do caixa em uma coluna na largura mínima. Estados vazios de comandas e pedidos conferidos.
- Console sem avisos ou erros na conferência final. Nenhuma comanda, venda, pagamento ou movimentação de caixa foi criada para teste. Não havia comanda aberta para repetir em produção a ajuda de destino; esse cenário foi validado localmente com dados fictícios. A validação móvel foi por emulação, sem teste em aparelho físico.

Evidências privadas fora do Git: `outputs/bar-producao-2026-10-19` no workspace principal, com resumo desktop/móvel, venda móvel e caixa em 320 px. Viewport restaurado e navegador deixado no resumo de produção.

Rollback compatível: primeiro a web anterior, deployment `01e5fb4a-8d35-4997-b7e5-9a86b6b64f60`, commit `772f83eac5a971b647639e52b95cb033e1412fd7`, branch `codex/mensalistas-ux-20261016`. Se necessário, depois a API anterior, deployment `b48d5990-4bde-4a3d-ae57-384401e9114d`, commit `ee803b7a2300af27f6f43dcc07dc0e194c701194`, branch `codex/recebimentos-bar-quadra-20261014`. Não reverter a API isoladamente enquanto a web depende de `low-stock-bar`. Preservar dados, banco e credenciais; sincronizar o snapshot e conferir plano sem divergências após retorno.
