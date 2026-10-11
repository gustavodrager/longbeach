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
