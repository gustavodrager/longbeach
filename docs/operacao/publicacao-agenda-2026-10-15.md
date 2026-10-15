# Publicação da Agenda — 15/10/2026

Publicação autorizada pelo proprietário nesta conversa. A web de produção foi fixada em `2ec1a67d4f037791427f44de437e3e0c6dd007b3`, branch `codex/agenda-ux-20261015`, após aprovação da [CI 38787913624](https://github.com/gustavodrager/longbeach/actions/runs/38787913624). Revisão: [PR #35](https://github.com/gustavodrager/longbeach/pull/35).

## Escopo

A Agenda prioriza o dia atual no celular, oferece navegação direta entre dias, recolhe o resumo semanal e mantém cabeçalhos fixos na grade desktop. Filtros ativos ficam explícitos e são preservados entre visualizações e ao abrir uma reserva. Datas e logotipo permanecem legíveis em telas estreitas. A identidade visual da Long Beach foi preservada. Detalhes de implementação e validação local: [Agenda UX](agenda-ux-2026-10-15.md).

Somente a web foi publicada. API, banco, migrations, variáveis, domínios e integrações preservados.

## Publicação e evidências

- Deployment web: `6d1eed2c-b22c-46be-a404-7862131a097a`, SUCCESS em 15/10/2026 às 18:55:05 UTC.
- API mantida no deployment `b48d5990-4bde-4a3d-ae57-384401e9114d`, commit `ee803b7a2300af27f6f43dcc07dc0e194c701194`.
- CI aprovada: 353 testes frontend, 339 unitários e 296 de integração em PostgreSQL 17 e 18, além de 14 testes dos conversores, builds e verificações operacionais.
- Patch de produção revisado imediatamente antes da aplicação: somente branch e commit da web. Configuração, nomes de variáveis e domínios comparados antes/depois e preservados. Registro declarativo `.railway/railway.ts` conciliado com a nova fonte. Nenhuma aplicação ampla de infraestrutura executada.
- `/agenda`, `/healthz`, `/health/live` e `/health/ready` responderam 200. O HTML oficial referencia `index-DoVSEpOc.js`; os arquivos `ArenaPages-BLeWv63p.js` e `ArenaPages-CJXi0y8K.css` da nova publicação responderam 200.
- Os seis serviços ficaram online, sem falhas recentes ou trabalho pendente; os deployments dos outros cinco serviços permaneceram iguais.
- Conferência autenticada no Chrome do perfil de gestão: grade semanal desktop, cabeçalhos fixos ao acessar “Ver atividades”, destaque de aulas, limpeza do destaque e abertura/fechamento dos detalhes de uma aula.
- Emulação móvel em produção: 390 × 844 e 320 × 844 px. Confirmados dia atual como visualização inicial, troca de dia pela faixa semanal, detalhes de aula, lista por período com datas empilhadas, filtro “Somente aulas”, indicação do filtro mesmo recolhido e limpeza retornando todas as atividades. Conteúdo principal legível e ajustado à largura; navegação de seções mantém rolagem própria. Não houve teste em aparelho físico.
- A PWA ainda exibia a versão anterior em cache; a ação existente “Atualizar agora” aplicou a publicação e preservou a sessão. Recarregar normalmente passou a manter a nova Agenda. Console sem mensagens de erro ao final da conferência; DevTools indicava recomendações em Issues, não auditadas nesta publicação. Emulação desativada e janela devolvida à Agenda desktop.
- Nenhuma reserva, aula, matrícula ou dado de produção foi criado ou alterado na conferência.
- Evidências privadas e verificações HTTP em `outputs/agenda-producao-2026-10-15/`, fora do Git. Nenhum dado de produção versionado.

## Retorno

Retornar somente a web ao deployment `22a0d2a6-af9c-4f81-84ed-42a7715b3db5`, commit `aa00f3134c65d005a5303e92490b3cf38088c791`, branch `codex/visao-geral-ux-20261015`. Preservar API, banco, identidades e integrações. Não reverter migrations ou restaurar dados locais em produção. Conciliar a fonte declarativa e conferir a atualização da PWA no navegador após eventual retorno.
