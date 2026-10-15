# Publicação da Visão Geral — 15/10/2026

Publicação autorizada pelo proprietário nesta conversa. A interface de produção foi promovida para `aa00f3134c65d005a5303e92490b3cf38088c791`, branch `codex/visao-geral-ux-20261015`, após aprovação da [CI 38779004184](https://github.com/gustavodrager/longbeach/actions/runs/38779004184). Revisão: [PR #34](https://github.com/gustavodrager/longbeach/pull/34).

## Escopo

A Visão Geral prioriza a operação do dia e pendências acionáveis, torna o resumo financeiro compacto e abre a composição dos saldos em painel próprio. Filtros de período e referências históricas ficam explícitos; cards e controles se adaptam às telas pequenas. O atalho de aulas abre a composição do dia. Selecionar aulas na Agenda remove filtros antigos de situação e grupo de reservas, evitando uma lista vazia indevida.

A conferência em Chrome com 320 px identificou corte do ano nos campos de data. A correção aumenta a largura mínima de cada campo, organizando-os em uma coluna quando necessário. A prévia local confirmou as datas completas.

Somente o serviço `web` foi publicado. API, banco, migrations, integrações, variáveis e domínios foram preservados. Não houve criação de reservas, cobranças, pagamentos ou cadastros de teste em produção.

## Publicação e verificação

- Web final: `22a0d2a6-af9c-4f81-84ed-42a7715b3db5`, SUCCESS em 15/10/2026 às 17:47:40 UTC. A primeira promoção (`6561287b-5df2-4917-958e-40ee010d00ee`) foi complementada pela correção da largura dos campos de data.
- API mantida: `b48d5990-4bde-4a3d-ae57-384401e9114d`, commit `ee803b7a2300af27f6f43dcc07dc0e194c701194`.
- CI: 347 testes frontend, 339 unitários e 296 de integração executados em PostgreSQL 17 e 18, além de 14 testes dos conversores, builds e verificações operacionais.
- Página inicial, `/healthz`, `/health/live` e `/health/ready` responderam 200 após a promoção. Os seis serviços ficaram online, sem falhas recentes nem trabalho pendente.
- Snapshots importados em JSON sem valores de segredos antes/depois; o diff mudou somente branch e commit da web. Snapshot declarativo conciliado e plano sem divergências. Configurações, nomes de variáveis e domínios comparados e preservados.
- A atualização da PWA foi aplicada no Chrome autenticado da Arena e preservou a sessão. Desktop: operação no topo, atalho de aulas mostrando somente a aula do dia, filtro mensal atualizando as datas e os resultados, composição de contas a receber abrindo e fechando corretamente.
- Validação responsiva em produção no Chrome autenticado da Arena: 320 e 390 px, cabeçalho e cards sem corte lateral, menu abrindo e fechando, painel financeiro legível e fechável, filtro Hoje atualizando datas e resultados, histórico expansível com referências explícitas. Após a correção, os campos mostram a data completa nas duas larguras. Desktop reconferido e navegador devolvido ao modo normal. A verificação móvel foi por emulação no Chrome, sem teste em aparelho físico.
- Evidências visuais e verificações HTTP ficam em `outputs/visao-geral-producao-2026-10-15/`, fora do Git por conterem informações da sessão real. Não foram versionados dados de produção.

## Retorno

Retornar somente a web ao deployment `4684fbae-2e2e-4cf8-b8ab-29e8f26b7dff`, commit `ee803b7a2300af27f6f43dcc07dc0e194c701194`, branch `codex/recebimentos-bar-quadra-20261014`. Preservar API, banco, contas, credenciais e integrações. Não restaurar dados locais em produção nem reverter migrations. Após retorno, conciliar o snapshot, conferir plano sem divergências e aplicar a atualização da PWA no navegador.
