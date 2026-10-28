# Publicação da agenda — 28/10/2026

Somente frontend: disponibilidade por quadra e período nas agendas, estados livres/ocupados/fechados/a confirmar e filtros coerentes. A redação financeira esclarece que Financeiro e Bar são recortes do mesmo financeiro e podem se sobrepor; valores, cálculos e consultas permanecem iguais. Nenhuma escrita de negócio na QA.

A fonte publicada é [`0d2b6b2`](https://github.com/gustavodrager/longbeach/commit/0d2b6b2ce5a73df1937ca5e76b5626f47543abb4). O [gate Production](https://github.com/gustavodrager/longbeach/actions/runs/40757175810) concluiu os quatro jobs na primeira tentativa com aprovação do proprietário. O run da preparação intermediária foi cancelado antes de publicar e não foi reutilizado como autorização.

| Prova | Resultado |
| --- | --- |
| Firebase live | `sites/parsero-prod-20261022/versions/6251aff9cb0eb816` |
| Release | `sites/parsero-prod-20261022/channels/live/releases/1793217604471000` |
| Publicação UTC | `2026-10-28T20:00:04.471Z` |
| SHA-256 da dist | `54ab7def7f67a6c5b44d1f6bca857d837ab4acc7beb45519726551fa2e1f45e0` |
| Verificação pública | 74 arquivos, 13 rotas SPA, headers e TLS |
| Testes frontend da fonte final | 663 aprovados em 68 arquivos; zero falhas |
| Build frontend | aprovado na fonte final |
| API implantada | fonte `b71dbf2`, schema 28 preservados |

A verificação no navegador confirmou semana, dia, manutenção do período, PWA correspondente ao artefato e os avisos de fonte financeira única. Não foram salvos dados de negócio. Não se trata de nova QA autenticada dos fluxos históricos de Bar/materiais. A consulta atual da API limitou-se ao GET público de readiness; não houve inspeção de banco ou infraestrutura. O build local anterior do backend foi reutilizado somente após comprovar identidade da árvore de código e do log; não houve reconstrução ou promoção da API nesta etapa.

A permissão temporária 64706865 da branch `codex/agenda-disponibilidade-20261028` foi removida após publicar. Os sete snapshots oficiais vinculados ao recibo de limpeza comprovaram restauração exata das branches originais e preservação das proteções, revisores e variáveis Production. Nenhuma outra policy foi alterada. Os hashes e baselines anteriores, a aprovação da API e todo seu histórico foram mantidos; a publicação web anterior foi arquivada integralmente como `optional_class_name_2026_10_28` no [registro de release](release-google-vm.json).

O retorno preparado é somente da web à versão `97cf18f08432f742`, fonte `213e988`, mediante nova autorização e revisão. Manter a API b71/schema 28; não executar Down, reabrir writers incompatíveis ou restaurar banco ativo. Nenhum retorno foi executado nesta publicação. Consultar também [a operação da VM](google-vm.md) e [as fontes por componente](../../deploy/google/source-revisions.json).

Recibos e capturas ficam privados; somente identificadores públicos e SHA-256 são publicados. Esta atualização de documentação é local e não executa publicação, alteração de dados, Git commit ou push.
