# Publicação global de UX/UI — 04/10/2026

Publicação autorizada pelo responsável nesta conversa após a entrega local. Projeto existente `longbeach-os` (`b88a93d7-6964-4ac5-9590-7cef49598cf0`), environment `production` (`e32774e4-b03e-4a1f-bae7-3e79263f76d9`). Escopo: somente as revisões dos serviços oficiais `api` e `web`; os demais serviços, domínios e banco existentes são preservados.

## Preparação comprovada

- 109 testes da interface e 184 do servidor aprovados, builds Release/PWA e sincronização dos recursos nativos concluídos. Detalhes e limites em [implantacao-ux-global.md](implantacao-ux-global.md).
- Auditoria de dependências com rede: sete projetos .NET com transitivas e 17 dependências de produção da interface, sem vulnerabilidades conhecidas. Dados de login dos testes substituídos por fixtures sintéticas; nenhum segredo ou dado pessoal real incluído nos arquivos da release.
- `railway config pull --force` importou o estado live com variáveis preservadas, sem expor secrets. `config plan --json` retornou `No changes`, sem diagnósticos.
- API: Production, migration no startup desativada, seed/bootstrap desativados; pre-deploy único `dotnet LongBeach.Api.dll --migrate-only`, timeout de 300 segundos.
- A antiga opção `DemoMode__PublicOperationalData` foi alterada para `false` somente na API oficial, sem deploy automático. O plano IaC permaneceu vazio após atualizar o snapshot e registrar os parâmetros públicos estáveis; secrets e configurações dos outros serviços foram preservados.
- Web: API oficial, `VITE_DEMO_MODE=false`, `VITE_OPERATIONAL_STORAGE=postgres`. Google não está habilitado nos serviços oficiais; preservar o login existente. PagBank permanece desativado por padrão.
- Consulta somente leitura no PostgreSQL: 14 migrations instaladas incluindo ImportStaging, estrutura de staging correspondente ao código, zero responsáveis com múltiplos caixas abertos/reabertos. Nenhum cadastro ou movimento de teste foi inserido em produção.
- Backup custom PostgreSQL criado no próprio volume em `/var/lib/postgresql/data/release-backups/longbeach-before-ux-20261004.dump`, 100178 bytes, SHA-256 `b7f9860933e08f53f5b77adece9bb07baf6bac40b7cfa9fb8e587943666c0a5d`. `pg_restore --list` leu o arquivo com sucesso; isso não equivale a ensaio completo de restauração.

## Revisões anteriores para rollback

IDs/digests observados na metadata live antes desta publicação:

| Serviço | Deployment | Digest |
| --- | --- | --- |
| API | `05c3e3b7-176d-4532-bed4-e5d11af1c136` | `sha256:98572679f6ab6d83d4d81793a877caf88cf93d66b494ba88a0b2b4827fab942e` |
| Web | `e07f30cc-deea-432d-902c-960dbb604725` | `sha256:125e7044314f6fea8f23bb9a2ed750b46673b72a803c338b788eda37b57795a0` |

O rollback restaura aplicações compatíveis, preservando as tabelas aditivas e seus fatos. Não executar `Down` de BarTabs/BarRecipes nem apagar dados confirmados.

## Promoção

Artefatos enviados diretamente do checkout limpo, commit local `50d223420344fbea417de73548e078831f18bf2b`. A API foi promovida primeiro; após confirmação das migrations, readiness e sessão autenticada existente, a web foi promovida com a mesma revisão.

| Serviço | Deployment | Resultado | Digest registrado na metadata Railway |
| --- | --- | --- | --- |
| API | `c5b6facc-9755-4671-9bd0-4425c7444a05` | SUCCESS | `sha256:7974835c261984c216a90443de1631eb931df4d64ec3fcf5782462ade73fd513` |
| Web | `ee6504a5-df49-4cfb-bee1-05e761919743` | SUCCESS | `sha256:a5e06f966e59d8385059e3564bbcb561b5ab263ace117a584ae66ef59b8d7ae1` |

Os logs de exportação OCI também identificam os manifests de build: API `sha256:79a929cc30830a6835f607518eb844931d87d395a9a6496e56862defdc1f0e9d`; web `sha256:74236c07b807d206e399759d3259def2e86fd5bb669309422e9641abefa736c4`. São identificadores distintos dos digests da metadata de execução acima.

## Verificação após a promoção

- PostgreSQL passou de 14 para 16 migrations, com BarTabs e BarRecipes instaladas. Consulta somente leitura confirmou zero comandas de teste e preservação das vendas históricas. Os 38 cadastros de alunos existentes continuam no servidor; nenhuma importação ou conversão automática foi executada.
- API oficial `/health/live` e `/health/ready` retornaram 200. Catálogo, comandas, caixa, operações e importações sem autenticação retornaram 401 com `Cache-Control: no-store`.
- Web oficial `/healthz`, início, Agenda, Atendimento, marca vetorial e fonte local retornaram 200. Bundle oficial novo: `/assets/index-BcBvWdrx.js`; HTML com `Cache-Control: no-cache`.
- A sessão existente do Owner foi restaurada após atualizar API e web. O aplicativo PWA detectou a revisão e o botão **Atualizar agora** carregou a nova interface.
- Atendimento mostrou os quatro caminhos e o responsável do caixa. Catálogo e caixas ainda vazios apresentam orientações de cadastro; nenhum caixa foi aberto para o teste.
- Gestão, Agenda, Escola, Financeiro, Equipe, Materiais da arena, Projetos, Manutenção, Receitas e Alunos carregaram no navegador autenticado, sem alertas de erro. O indicador de recebimentos abriu lista filtrada com o mesmo total e zero registros; a URL conserva o período.
- Console do navegador: zero erros na amostra final. Logs da API: 169 entradas consultadas, zero entradas com nível error/fatal. Isso é um smoke de leitura, não um ensaio de pagamentos reais.
- Somente as revisões de `api` e `web` mudaram. Serviços adicionais, Postgres e todos os bindings de domínio permaneceram iguais. `config plan` final: **No changes**, sem diagnósticos; nenhum `config apply` foi necessário.
- Chave SSH temporária de conferência revogada no Railway, agente local encerrado e arquivos privados temporários removidos. O backup permaneceu no volume próprio do PostgreSQL, sem download ou versionamento.

Evidência visual: [visão geral em produção](publicacao-ux-producao-2026-10-04.jpg).

**Estado deste registro: publicação concluída e smoke de leitura aprovado.**

Antes da operação do Bar, cadastrar produtos, estoque inicial e caixas. PagBank continua desativado até homologação. Validação com cinco atendentes, ensaio de staging isolado e pacotes Android/iOS assinados continuam pendentes, conforme o [registro de implementação](implantacao-ux-global.md).
