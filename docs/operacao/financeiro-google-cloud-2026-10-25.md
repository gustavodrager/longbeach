# Financeiro no Google Cloud — publicação de 25/10/2026

**Publicado em produção:** Financeiro → Despesas e pagamentos, em `/financeiro/despesas`, reúne despesas, remuneração mensal ou por diária/turno e obrigações de reembolso aos sócios. A aplicação continua nos domínios habituais; esta publicação ocorreu depois da [migração para o Google](google-cloud-entrega-2026-10-25.md), sem nova transferência de banco ou DNS.

## Versão publicada

| Referência | Valor verificado |
| --- | --- |
| Código da API e web | `ee33a37ed9f3df3458ddae1a2b031a9a8434d014` |
| Commit do manifesto | `60a7267edcb45e491602fcf246f0e88c9f0e712f` |
| API Cloud Run | `longbeach-api-00004-qh6`, `Ready`, 100% do tráfego |
| Índice OCI aprovado da API/job | `sha256:5c7a8a6c41761fdb58567318bca2b959d86b41cca469b2ac4131927fe63729fe` |
| Manifesto filho Linux/AMD64 | `sha256:b0ac9af475dea02d267eeedc50740bc6de2402ec3c221c048531fc1bdc748c44` |
| Execução de migration concluída | `longbeach-migrate-nf9pq`, uma tarefa, sem retry |
| Firebase Hosting | Versão `8c6474ee482305e1`, release live `1792926108787000` |
| Hash do artefato web | `79add4f635473873757245d4be922c82cd5cf9778d23c1fa9c32789ff0bd3a3e` |
| Hash do HTML principal | `59a630725061308ed9e01acd0444bf54fdeab67728a9d6a0c4710e56db08f452` |

A imagem fica no Artifact Registry de `parsero-prod-20261022`, repositório `longbeach/api`, em São Paulo. O hash dos bytes do índice OCI comprova seu único filho Linux/AMD64; o Cloud Run resolveu a execução para esse filho. A configuração continua fixada no índice aprovado. Não confundir essa resolução com uma imagem diferente ou aceitar outro digest sem a prova correspondente.

Os **75 arquivos públicos** do frontend coincidem com o artefato conferido. A configuração Firebase, SPA/PWA, origem canônica da API e headers foram preservados. A metadata privada de build não foi publicada como conteúdo do site.

## Banco e infraestrutura

O banco oficial permanece `longbeach`, **OID 24760**, na instância Cloud SQL de produção em São Paulo. O candidato arquivado, OID 16568, permanece isolado, sem conexão do runtime e sem sessões observadas. Ele não é a base de operação.

O histórico real passou de 26 para **27 migrations**, incluindo `20261021154910_ExpenseAttachments`. A mudança é aditiva: cria a tabela de comprovantes; não cria obrigações, pessoas, pagamentos ou movimentos de estoque. A conferência nativa PostgreSQL, somente leitura, validou o histórico, o owner migrador, o marcador do banco, as permissões/defaults e o pool runtime no OID correto. A tabela nova pertence ao migrador; o runtime recebeu SELECT/INSERT/UPDATE/DELETE, sem privilégios adicionais ou concessões a `PUBLIC`.

O job de migration foi promovido primeiro, por plano direcionado exclusivamente à sua imagem. Depois da execução única e da validação do schema, o plano completo, com **57 recursos**, alterou exclusivamente a imagem da API. O job já estava na imagem nova e ficou sem alterações; SQL gerenciado, IAM e DNS ficaram sem mudanças propostas. O drift observado antes da promoção limitou-se ao `update_time` do Artifact Registry e aos metadados de execução do job, conferidos separadamente dos campos configurados.

A conferência Terraform final de **11h02min52s UTC** concluiu com saída 0, plano completo sem alterações de configuração, outputs ou drift. As variáveis privadas passaram a refletir somente a imagem nova, SHA-256 `d3883f33e2b4da7be6a7d38014ff95cdc152549063728542b99de801e2c56cb4`; os demais parâmetros foram preservados.

`BackgroundJobs__Enabled=true` permanece ativo. Os quatro controles automáticos abaixo continuam `false`:

- `Database__MigrateOnStartup`;
- `Authorization__SeedOnStartup`;
- `Bootstrap__InitialOwner__Enabled`;
- `Authentication__Google__ProvisionAllowedEmailsAsOwners`.

Produção e homologação continuam separadas. HA entre zonas, backups diários em São Paulo, PITR de sete dias, segredos e autenticação ao Cloud SQL permanecem configurados como antes. O backup anterior à publicação, **1792924004924**, terminou `SUCCESSFUL` em São Paulo às **10h28 UTC**. LavaMais e Danielli não foram habilitados por esta release.

## Validação e correção do artefato

A integração passou em **443 testes unitários, 357 integrações PostgreSQL 18, 465 testes do frontend e 40 verificações dos scripts**, além dos builds da API e web. Esses números descrevem a validação local desta integração, não uma promessa de capacidade ou disponibilidade.

O teste do artefato OCI aprovado executou a imagem com seu usuário real sem privilégios, usando PostgreSQL 18 sintético em rede interna sem portas no host. Confirmou configuração legível e sem escrita pelo runtime, uma execução `--migrate-only`, 27 migrations e ausência de usuários/obrigações semeados. A API retornou saúde HTTP 200 e autenticação HTTP 401 sem sessão; o startup manteve o banco sintético inalterado. Os contêineres, a rede e a configuração temporária do credential helper foram removidos após o teste.

A primeira imagem, `sha256:8047571b9accfbe1878f3fc7ce4517557735d57d5446425cf6ebbc2b8a1997ef`, falhou na execução `longbeach-migrate-5bldn`: `appsettings.json` estava com modo 0600 e não podia ser lido pelo usuário da imagem. A exceção ocorreu em `WebApplication.CreateBuilder`, antes do fluxo EF; a consulta posterior ao banco confirmou ainda 26 migrations e permissões preservadas. A exportação da fonte foi corrigida para preservar os modos Git, mantendo o diretório externo privado. A imagem aprovada passou a ter configuração 0644 legível pelo runtime sem torná-lo root. **Não reutilizar o artefato 8047 nem repetir a execução que falhou.**

Após a promoção real, foram conferidos prontidão, autenticação obrigatória, CORS, revisão/imagem, flags e conteúdo web. A conferência real do banco após a API nova confirmou novamente 27 migrations, grants e conexões runtime, com encerramento e ausência do cliente temporário de verificação. Esses testes não substituem o acompanhamento da operação nem validam todas as integrações bancárias externas.

## Operação e vínculo de compras

Seguir o [procedimento de Despesas e pagamentos](despesas-e-pagamentos.md). O formulário solicita somente os campos aplicáveis: descrição/valor/situação para uma despesa; pessoa/período/valor para equipe; identificação do sócio quando ele adiantou recursos pessoais. Observações, referência de comprovante e data do lançamento ficam no contexto secundário; datas necessárias ao pagamento e ao período trabalhado aparecem quando aplicáveis.

Nas Compras do Bar, usar **Financeiro da compra**. O sistema reaproveita total, data e unidade da compra e abre o lançamento já vinculado, quando houver. Um adiantamento de sócio gera uma obrigação pendente; não exige repetir a compra ou o recebimento de mercadorias. **Reembolsar** registra uma devolução já realizada e não deve ser usado apenas para cadastrar o valor devido.

Nesta publicação, a UI autenticada validou um lançamento real pendente vinculado à compra existente, sem confirmação de pagamento ou reembolso. A persistência foi conferida após recarregar: reabrir **Financeiro da compra** levou aos detalhes do mesmo lançamento, com histórico sem reembolso, preservando o recebimento da compra. A API permaneceu sem erros observados na conferência posterior. O documento, os valores, a pessoa, os IDs e as evidências desse lançamento permanecem privados e não fazem parte deste registro.

Leitura exige `finance:read`; cadastro, baixa e anexos exigem também `finance:write`. Cadastro de sócio não cria conta de acesso. Uma resposta perdida deve ser repetida com a mesma chave da operação, preservando a proteção contra duplicidade. A devolução reduz a mesma obrigação; não cadastrar uma segunda despesa para ela. O registro não inicia transferência bancária nem altera o extrato ou o caixa físico.

## Estabilização e recuperação

Acompanhar erros da API, rotinas, backups, espaço e consumo no Google. A release usa os serviços existentes; o custo observado durante a migração não é uma mensalidade garantida nem uma medição deste módulo. O orçamento e os alertas continuam conforme o [registro de entrega](google-cloud-entrega-2026-10-25.md).

Se houver necessidade de retorno, preferir **retornar apenas a web** ao artefato anterior do Firebase, versão `d42e47a2c8189591`, mantendo a API nova compatível, a migration aditiva e as proteções dos registros gerenciados. Revisar o artefato e conferir a publicação; não trocar API, dados ou DNS como consequência automática desse retorno.

Não executar `Down` da migration, que remove comprovantes, nem restaurar backup sobre lançamentos novos. Qualquer recuperação de dados deve ocorrer em destino isolado, com conferência e reconciliação antes da promoção. O Google continua sendo a fonte oficial; não reiniciar o Railway para voltar a uma cópia antiga. Preservar os recursos históricos durante a estabilização, sem permitir workers simultâneos nos dois provedores.

Recibos e resultados completos ficam nos artefatos privados da operação. Não versionar senhas, tokens, configurações de credenciais, dumps, conteúdo de comprovantes ou dados pessoais/de negócio dos lançamentos.
