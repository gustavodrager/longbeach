# Correção do cancelamento no catálogo do Bar — 27/10/2026

A correção da fonte `6a905cf027463e7688baae560fc824e0e5a591d7` foi publicada somente na web em 27/10/2026, às 21:24:12 de Brasília (`2026-10-28T00:24:12.366Z`). O [gate de produção 40607340020](https://github.com/gustavodrager/longbeach/actions/runs/40607340020) concluiu os quatro jobs com sucesso na tentativa 1, incluindo aprovação do proprietário no environment Production. A conferência autenticada terminou às `2026-10-28T00:28:04.667Z`, sem editar campos de produto ou estoque e sem salvar operações. A versão anterior dc59/c6b5 permanece preservada como ponto de retorno, conforme o [registro daquela publicação](publicacao-movimentos-importados-2026-10-27.md).

## Causa e correção

No catálogo do Bar, Cancelar seguido imediatamente de busca, filtro ou paginação podia reintroduzir `acao=editar` e `registro` na URL. Os eventos seguintes reconstruíam a consulta a partir do endereço capturado antes do cancelamento; ao voltar à página do produto, o editor reaparecia. O cancelamento isolado removia os parâmetros corretamente. A reprodução local utiliza autenticação e catálogo sintéticos, DataRouter e `UnsavedChangesProvider` reais, com consultas simuladas e recusa de qualquer escrita.

O wrapper compartilhado `useContextSearchParams` agora executa callbacks sobre a localização atual do DataRouter, incluindo uma navegação já aceita e ainda pendente para o mesmo caminho. Destinos recusados pelo bloqueio de rascunhos não são guardados como base. Apenas os eventos envolvidos de filtros/paginação e abertura/fechamento/disponibilidade do catálogo passam a usar esses callbacks; trocar somente para o callback nativo do React Router não resolveria, pois ele também utiliza o snapshot do render.

A alteração fica limitada a três arquivos de implementação frontend e dois arquivos de regressão. Não adiciona fila, cache, estado global ou listeners. Preserva o contexto de retorno, os demais parâmetros, o reset de página ao filtrar, as opções de histórico e o bloqueio de alterações não salvas. Fora do DataRouter, mantém as atualizações sequenciais normais pelo contexto de localização existente.

## Validação local

Os quatro casos iniciais falharam antes da correção: Cancelar seguido de busca, filtro, próxima página e busca mais próxima página. Após a alteração, os dez testes novos passaram, cobrindo também reinício da paginação, navegação recusada e depois permitida, voltar/avançar, contexto preservado, loader pendente e funcionamento fora do DataRouter.

Passaram 40 testes afetados em seis arquivos e a suíte frontend completa, com 595 testes em 63 arquivos. O build frontend e a conferência de whitespace passaram. O build local da API em Debug também concluiu com zero avisos e zero erros; isso não representa publicação ou inicialização da API. O gate remoto aprovou frontend e backend com PostgreSQL 17 e 18 descartáveis. Os testes não utilizaram dados reais.

Os logs antes/depois, builds e recibos privados ficam em `LongBeach/evidencias/correcao-cancelamento-bar-2026-10-28/`; o nome dessa pasta usa a data operacional UTC, enquanto este documento usa a data de Brasília. O recibo `frontend-result.json` tem SHA-256 `8e166a0bb4ba2a1f18fbe191eff292a7e35f24214f1de7b4173a82780dacb789` e vincula os arquivos e logs locais, sem dados pessoais, credenciais ou conteúdo de produção.

## Publicação e retorno

O proprietário autorizou investigar, corrigir, testar e publicar sem alterar dados reais. A branch já permitida `codex/estoque-materiais-20261027` avançou por fast-forward, preservando a publicação dos movimentos bancários importados. As regras de branch, revisão e aprovação do environment permaneceram iguais, sem ampliar permissões.

- Firebase: `sites/parsero-prod-20261022/versions/fdb00c03f6047ff8`.
- Release: `sites/parsero-prod-20261022/channels/live/releases/1793147052366000`.
- SHA-256 da árvore pública: `12f19bb86b80c290a1db0945251cc8eb8ef32cd3452a1305154dcceb7eb6aff8`.
- Plano: `1cb259138230adc43b49b4f9a6d2ee2f13b08376a9caa830c13874d1b29632a6`.

Uma preparação local inicial foi interrompida na instalação de dependências por restrição de rede, antes de gerar artefato; log e manifesto foram preservados. A preparação revisada com acesso ao registro oficial concluiu o artefato congelado da fonte. A única publicação Firebase terminou com código zero e resultado conhecido, sem reconstruir o pacote na implantação. Os 73 arquivos públicos, seis rotas SPA, configuração Firebase, headers, TLS, identidade live e exclusão dos metadados privados passaram na conferência posterior. A API foi consultada somente por GET público de readiness; não houve reinspeção da VM ou comparação de hashes do banco.

A atualização do PWA foi ativada pela interface. O navegador carregou o bundle do artefato conferido e aprovou Cancelar → limpar busca → próxima página → anterior, Cancelar → Repor → Esgotados → Todos, voltar/avançar e reabertura explícita seguida de cancelamento. A edição permaneceu fechada, sem os parâmetros antigos de ação, e o saldo observado permaneceu igual. Nenhum campo de produto/estoque foi editado, nenhuma operação foi salva e o console não apresentou avisos ou erros. O caso sem render intermediário é comprovado separadamente pelos testes sintéticos.

Os recibos privados `web-publish-result.json`, `web-verify-result.json`, `browser-verification.json`, `github-production-gate.json` e `github-production-policy-unchanged.json` vinculam os resultados reais à fonte e ao plano. Seus hashes ficam no [registro atual da release](release-google-vm.json), junto dos comprovantes históricos preservados.

O ponto de retorno desta correção é exatamente `sites/parsero-prod-20261022/versions/c6b5e6266e9cab5f`, fonte `dc59e81a0ea7e6423752976196781a62bed9bfaa`. O procedimento privado revisado está em `README-release-web.md` e `release-web.py` na pasta de evidências: após nova autorização explícita, conferir live atual, alvo FINALIZED, configuração e plano; criar a autorização posterior à verificação e executar uma única ação de retorno somente no Firebase, conferindo live e readiness ao final. Não remover marcadores ou repetir uma operação de resultado incerto. Esse retorno recupera também o comportamento anterior que motivou a correção; não foi executado nesta publicação.

A API permanece na fonte `b71dbf22127a6475b91770ba8f643df7933330b9`, com referência histórica de schema 28. Não promover uma imagem API produzida pelo gate da web, executar Down, reabrir escritores antigos ou restaurar sobre o banco ativo. Os backups e comprovantes históricos permanecem preservados; esta correção não executou novo backup do banco nem migration. Consulte o [registro atual da release](release-google-vm.json) antes de qualquer operação futura.
