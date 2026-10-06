# Indicadores do bar — revisão visual de 6 de outubro de 2026

O acesso direto a `/bar/indicadores` usava classes do atendimento sem carregar as folhas de estilo correspondentes. Os cartões apareciam como links corridos, os filtros sem alinhamento e o conteúdo sem os recuos da gestão.

O resumo e o detalhe agora usam o layout, o cabeçalho, os cartões, os estados vazios e a tabela responsiva da gestão. Os estilos dos componentes de atendimento reutilizados são importados explicitamente. A situação atual e os resultados do período têm seções próprias, datas locais e indicação da última atualização. As fontes e a interpretação dos indicadores permanecem acessíveis. Consultas, contratos, cálculos financeiros, permissões e rotas foram preservados.

Validação local: 173 testes frontend; builds da web/PWA e API aprovados. Navegador com dados fictícios em 360, 390, 768 e 1440 px sem transbordamento horizontal; resumo → detalhe → retorno preserva datas. Conferidos período inválido, zero, número negativo, dado indisponível, lista vazia, foco visível e envio do filtro por teclado. Console sem erros. Nenhuma movimentação real foi criada.

Revisão publicada: `97730fb7e5ceef6cd22f1bc3e489e014faa434e0`, CI `37502867550` aprovado nas etapas frontend e backend. Web Railway: deployment `649e9aaa-d554-4608-963b-0f4a11e9999a`, `SUCCESS`. API preservada em `b29dfbd97bc34bc6b22b3b130450bec17f747211`. Endpoints públicos de saúde responderam `ok` e `Healthy`.

O patch de produção continha exclusivamente a troca do commit da web. Variáveis públicas conferidas antes do build; snapshot sincronizado e plano final sem drift. Rollback disponível para a web anterior: deployment `9e15b68d-cffb-46d4-bdf1-7fdff44a9341`, revisão `5384056c8482bf3a1c6131fee389b93edebfcef2`.

Após atualizar a PWA no Chrome, o domínio oficial apresentou o novo resumo e o detalhe de recebimentos. Os totais permaneceram iguais aos consultados antes da publicação; a navegação de retorno funcionou e o console não registrou erros. Verificação em produção somente de leitura.
