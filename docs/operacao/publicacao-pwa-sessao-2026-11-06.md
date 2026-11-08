# Publicação — sessão preservada na atualização — 06/11/2026

A revisão [#72](https://github.com/gustavodrager/longbeach/pull/72) foi publicada em **06/11/2026 às 06:35:52 (Brasília)**. Fonte `cee1976699944d6ad39ca36f2d0c9859b162fdbc`, branch `codex/pwa-sessao-20261105`, Production `42191753505/1`. O [registro da publicação](release-pwa-sessao-2026-11-06.json) identifica os artefatos e as verificações finais. A conclusão da revisão #71 foi conferida como pré-requisito.

A atualização do aplicativo aguarda a restauração da sessão e mantém a tela aberta, incluindo seus parâmetros e posição identificada no endereço. Falhas temporárias de conexão oferecem nova tentativa na mesma tela. Uma sessão recusada continua seguindo as regras existentes de autenticação. No teste local, três abas preservaram a sessão durante atualização com renovação pendente, sem autenticação real nem alterações de dados.

Foi publicada somente a interface oficial, com proveniência e SBOM, sem recompilação local. Esta operação não implantou API nem alterou banco, credenciais, perfis, acessos ou configuração do Google. Saúde e opções públicas da API foram comparadas com a captura atual por hash.

Passaram 1435 testes da interface em 117 arquivos, incluindo 47 novos casos de regressão, além dos builds da interface e da API. CI e os cinco jobs de Production foram aprovados na fonte exata. A conferência de infraestrutura da PR não se aplicava ao diff desta revisão; essa condição foi verificada pelo conteúdo Git imutável.

O Hosting entregou 111 arquivos da aplicação e 113 ativos, incluindo os dois arquivos preservados do provedor. Passaram **132 verificações públicas**, sem falhas: arquivos por conteúdo, 13 rotas, saúde/opções da API e quatro bloqueios anônimos de APIs privadas. O aviso de atualização carregou o arquivo `/assets/index-Dxy1_LIb.js` após Atualizar agora. Uma sessão autenticada de produção foi conferida antes e depois da atualização, preservando o endereço da tela e sem retornar ao login nem alterar registros.

Foi removida somente a política temporária `65721787`. As políticas originais foram comparadas pela projeção de id, nome e tipo; os revisores e as demais proteções foram conferidos e preservados. As abas de teste foram encerradas. Os oito arquivos locais preexistentes acompanhados nesta operação permaneceram intactos. Os comprovantes privados ficam fora do Git, na pasta de evidências da revisão.
