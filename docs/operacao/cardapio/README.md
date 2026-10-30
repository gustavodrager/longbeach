# Cardápio digital

Gestão: `/bar/cardapio`, permissão `bar:catalog:write`. Apresentação pública somente de leitura: `/cardapio/apresentacao`.

Carregue o modelo aprovado explicitamente, confira cada vínculo com o cadastro e resolva pendências. Preços são os preços de venda oficiais: alterá-los afeta vendas; a apresentação só muda após publicar novamente. Salvar o rascunho não publica. Grupos precisam de preços positivos iguais em todos os produtos ativos vinculados. Conflitos exigem recarregar antes de salvar/publicar novamente.

A apresentação alterna a cada 10 segundos por padrão (configurável entre 5 e 120), consulta publicação a cada 30 segundos e aplica a atualização na troca de tela. Uma categoria pode ocupar várias telas. Controles permitem pausa, navegação e tela cheia. Após carregar online, conserva somente dados públicos da última publicação válida. Sem primeiro carregamento não há garantia offline. O cache pode não persistir em modo privado ou após limpeza de dados do navegador.

No tablet, abra a apresentação online e instale/atualize a PWA. O modo tela cheia tenta manter a tela acesa quando o dispositivo permite. Configure o bloqueio automático do tablet para o uso desejado; o navegador não garante impedir o bloqueio em todos os sistemas. Verifique retrato e paisagem antes do uso.

## Publicação operacional

A implementação local não é uma publicação. Preparar a release sobre a fonte publicada. A inspeção real de 29/10 encontrou API 431d058, runtime d71acb9 e schema 29 com clientes já publicados; preservar essa base e acrescentar apenas o cardápio. A base anterior b71/schema 28 está superada. Revisar migration/snapshot, testar PostgreSQL isolado, builds, autorização, concorrência e fluxo no navegador. Fixar commit e digests e obter aprovação do environment Production sem alterar proteções.

Antes da promoção, conferir imagem/schema reais, saúde e backups. Aplicar somente a migration aditiva do cardápio uma vez por operação controlada, com transação, guarda dos IDs anteriores, lock e timeouts. Não usar o executor histórico Cloud Run ou seed de produção. Publicar API por digest e frontend Firebase com bytes congelados. Conferir saúde, autorização, PWA, conteúdo e apresentação antes de registrar conclusão.

Retorno: preservar tabela/publicação e schema aditivo; não executar `Down`, apagar dados ou restaurar sobre o banco ativo. O frontend pode voltar à versão anterior preservando a API nova. A API anterior tem prova de schema 29 e não deve ser iniciada contra schema 30 pelo preflight: em falha da candidata, manter escritores parados e preparar correção compatível com schema 30. Não alterar labels ou reduzir o gate para forçar um retorno. Não iniciar API de clientes contra schema sem clientes.

A mudança exige instalar a versão revisada do preflight para schema 30 junto da promoção da API, preservando os demais arquivos de runtime. O job SQL revisado está em `migration-job.sql`, com prova em `migration-proof.json`; sua presença no repositório não significa execução. O guard recusa uma lista anterior diferente ou a tabela já existente. Conferir owners/grants e backups/WAL antes da janela, ensaiar o job exato em PostgreSQL18 isolado, verificar 30 IDs e dados anteriores antes de liberar escritores.

O environment Production consultado exige o revisor Gustavo e permite apenas a branch histórica `codex/estoque-materiais-20261027`. O responsável deve permitir especificamente a branch candidata `codex/cardapio-producao-20261029` e aprovar seu run; não reutilizar a branch histórica para contornar essa restrição. A autorização de outra release não vale para o cardápio.
