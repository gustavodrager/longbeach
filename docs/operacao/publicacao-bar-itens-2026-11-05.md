# Publicação — remoção simples de itens do bar — 05/11/2026

A revisão [#71](https://github.com/gustavodrager/longbeach/pull/71) foi publicada em **05/11/2026 às 22:49:35 (Brasília)**, após a conclusão e verificação da revisão #70. Fonte `ca548dd8ba5de57cc189f5d9f8fa9f96890bfcee`, branch `codex/bar-itens-remocao-simples-20261105`, Production `42142301090/1`. O [registro da publicação](release-bar-itens-2026-11-05.json) identifica os artefatos e as verificações finais.

Pedidos e comandas passam a permitir a remoção de um item com confirmação, sem preencher um motivo. A confirmação mostra o item, a quantidade e o efeito no pedido. O sistema preserva o histórico com uma descrição neutra; as permissões de rejeição e estorno continuam aplicadas, sem devolução automática de estoque. O cancelamento da comanda continua exigindo motivo. Tentativas com resposta incerta conservam o mesmo identificador e os mesmos dados para evitar operações duplicadas.

Foi publicada somente a interface oficial, com proveniência e SBOM, sem recompilação local. Esta operação não implantou API nem alterou banco, credenciais, perfis, acessos ou configuração do Google. Saúde e opções públicas da API foram comparadas com a captura atual por hash.

Passaram 1388 testes completos da interface, 172 testes afetados e o build TypeScript/Vite/PWA. CI e os cinco jobs de Production foram aprovados na fonte exata. A conferência de infraestrutura da PR não se aplicava ao diff desta revisão; essa condição foi verificada pelo conteúdo Git imutável.

O Hosting entregou 111 arquivos da aplicação e 113 ativos, incluindo os dois arquivos preservados do provedor. Passaram **132 verificações públicas**, sem falhas: arquivos por conteúdo, 13 rotas, saúde/opções da API e quatro bloqueios anônimos de APIs privadas. O aviso de atualização do aplicativo levou ao arquivo `/assets/index-DZi1TJ7m.js` após Atualizar agora.

Foi removida somente a política temporária `65687501`. As políticas originais foram comparadas pela projeção de id, nome e tipo; os revisores e as demais proteções foram conferidos e preservados. A aba de teste foi encerrada. Os seis arquivos locais preexistentes acompanhados nesta operação permaneceram intactos. Os comprovantes privados ficam fora do Git, na pasta de evidências da revisão.
