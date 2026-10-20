# C6 — validação de implementação em 2026-10-19

Implementação: `2053ce442625484c8ad7f4ec647799e12e1505f1`, sobre a versão de produção `11689011ff7bd0ec6ece7db333e4378d9bc3bd79` e seu registro `046ef43`. [Revisão #43](https://github.com/gustavodrager/longbeach/pull/43).

## Evidências

- Build .NET Release sem erros ou avisos; frontend TypeScript/Vite/PWA concluído.
- Banco PostgreSQL local novo: 413 testes unitários e 336 de integração, todos aprovados.
- Interface: 409 testes em 45 arquivos, todos aprovados.
- [CI 39346680034](https://github.com/gustavodrager/longbeach/actions/runs/39346680034): PostgreSQL 17 e 18 e frontend aprovados. Inclui aplicação das migrations, readiness e restauração sintética de backup.
- [CI 39347679187](https://github.com/gustavodrager/longbeach/actions/runs/39347679187): mesmos três jobs aprovados no commit `def7e333cad951e3c004f56f5ae0a53f172f74ff`, que acrescenta somente dois documentos à implementação `2053ce4`.
- Navegador local, usuário fictício: acesso ao financeiro, estado C6 não conectado sem saldo inventado, extrato vazio com identificação de sandbox e diagnóstico de recursos desativados. Extrato e integrações responderam HTTP 200.
- Nenhuma chamada real ao C6: homologação, credenciais, certificado, callbacks e movimentações reais continuam pendentes.

## Preparação da publicação

Snapshot Railway importado sem valores de secrets e plano sem diferenças antes da preparação. A promoção prevê somente API e web no projeto standalone, mantendo demais recursos, domínios e ambientes. Todas as flags C6 são falsas por padrão e não há variáveis C6 configuradas na API de produção.

A criação de um snapshot manual do PostgreSQL pelo recurso nativo do Railway falhou duas vezes com `Failed to create a backup`; listagem posterior vazia, sem ID de backup. Volume conferido no projeto/ambiente corretos, disponível e com espaço. Não foi ativado PITR nem alterado agendamento, serviço de banco ou rede.

Após autorização explícita do responsável, foi criada uma chave SSH temporária para gerar um backup lógico somente do PostgreSQL da LongBeach. O arquivo custom foi concluído em 20/10/2026 às 00:30:04 UTC, fora do `PGDATA`, em `/var/lib/postgresql/data/longbeach-backups/pre-c6-migration-2053ce4.dump`: 910.455 bytes, diretório `0700`, arquivo `0600`, SHA256 `717ddcb75149c4c74620dedbc5d023b8b394ae83ef9e45073f3cf57df5ecd95d`. `pg_restore --list` e a decodificação integral para `/dev/null` passaram. A chave temporária foi revogada, sua ausência conferida e a chave privada local removida antes da publicação.

Esse backup está no mesmo volume do banco e não cobre perda do volume. A verificação integral não equivale a teste de restauração. Nenhum dump ou dado de produção foi copiado para o repositório. A ativação bancária continuará dependendo do [roteiro C6](c6-integracao.md).

## Publicação

API publicada com sucesso no deployment `e297480d-3b88-41ce-a6b8-504730f14a3e`, imagem declarada em `meta.imageDigest`: `sha256:147b3144807c524583e94bc7dd319ac234104e9beae0c73f6f1c966d55c1b6a2`. Embora o primeiro patch de fonte pedisse `2053ce4`, o Railway identificou o artefato como `def7e333cad951e3c004f56f5ae0a53f172f74ff`; a diferença é exclusivamente documental e o CI dessa revisão também passou. A configuração foi alinhada a `def7e33` por patch restrito ao commit da API, com `skipDeploys=true`, sem nova publicação. A evidência usa o commit declarado pelo deployment.

O predeploy único aplicou nominalmente `20261020010000_C6Banking` e `20261020020000_C6PaymentProviders`, registrando `Database migrations completed successfully` às 00:35:08 UTC de 20/10/2026. A etapa `PRE_DEPLOY_COMMAND` terminou às 00:35:12 UTC sem erro. Os logs são estruturados; os nomes das migrations estão nos atributos, mesmo quando `message` está vazio.

Web publicada depois da API saudável: deployment `e28c44ea-5018-48c3-9b67-4bcc13c5dbe5`, `SUCCESS`, mesmo commit `def7e33`, imagem `sha256:0de380d5b5531ac9239948e4dbaeb03ec280b11183903048181833207aa3599c`.

Conferência HTTP após a publicação: API `/health/ready` = `200 Healthy`, web `/healthz` = `200 ok` e página inicial = `200`. Extrato C6, posição financeira e integrações retornaram `401` sem sessão. A interface pública e sua atualização PWA foram conferidas; a validação autenticada específica do C6 foi feita localmente com dados fictícios, não nesta produção. Nenhuma cobrança, receita ou movimentação de teste foi criada no ambiente real.

Não há variáveis C6 configuradas na API; `Enabled`, `BankingEnabled` e `PixEnabled` permanecem falsas por padrão. Fonte, build, réplicas, domínios e nomes das variáveis foram comparados; os patches desta publicação alteraram apenas fonte de API/web. O snapshot importado após a API resultou em plano sem diferenças. O responsável autorizou coordenar uma publicação posterior conjunta com Pedidos do Bar; o registro final de infraestrutura dessa versão fica sob a revisão #42, evitando sobrescrever seu trabalho com um snapshot intermediário.

## Retorno da aplicação

Antes de qualquer operação C6 persistida, o schema aditivo permite retornar ao binário `1168901`, preservando tabelas, colunas e histórico de migrations. Não executar `Down` nem restaurar um backup sobre produção como rotina de rollback. Após existir operação C6, manter uma versão que compreenda o provedor e acompanhe os pagamentos; suspender novas cobranças com `PixEnabled=false`.

Se a API antiga voltar a operar, ela poderá criar pagamentos externos do Bar sem preencher `PaymentProvider`. Antes de promover novamente a integração, auditar e completar apenas os registros legados de Pix/cartão com provedor nulo, identificando-os como PagBank. Não alterar pagamentos manuais/dinheiro nem registros já identificados como C6.
