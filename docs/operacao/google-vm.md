# LongBeach — operação da VM econômica Google

Corte de infraestrutura aplicado em 26/10/2026, com aceite explícito e retirada definitiva dos recursos substituídos concluída no mesmo dia. API e banco operam na VM; o frontend permanece no Firebase. Os planos, hashes e recibos de execução permanecem privados; nunca versionar dumps, credenciais ou dados pessoais. Os registros abaixo preservam a cronologia; a seção mais recente descreve o estado atual.

## Retirada definitiva e conferência às 18h42 de Brasília (21h42 UTC)

O responsável autorizou remover a estrutura gerenciada antiga e a homologação, preservando a VM e os backups. A conferência posterior confirmou **zero instâncias Cloud SQL, serviços/jobs Cloud Run, forwarding rules, backends e IPs antigos** nos dois projetos. Produção mantém somente a VM `longbeach-economy`, seus dois discos e o IP `34.39.163.230`; homologação está sem VM, disco, IP ou repositório de imagens. O frontend de produção continua no Firebase. Segredos e imagens usados pela VM foram preservados.

Antes da exclusão das instâncias, a retenção de backups foi gravada e conferida na API. Foi necessário iniciar os bancos antigos para configurar essa opção e pará-los novamente; APIs, workers e gravações da origem continuaram bloqueados. Após a exclusão, a listagem de backups no nível dos projetos confirmou **oito cópias de produção e seis de homologação**, todas `SUCCESSFUL`, incluindo cópias automáticas e sob demanda. Essas cópias preservam o período anterior à VM e seguem suas retenções próprias. **Não excluir os projetos ou buckets que sustentam os backups e a recuperação.**

A primeira execução de retirada foi parcial porque o provider ainda bloqueava a exclusão do serviço/job Run por sua proteção local. Os planos anteriores não foram repetidos. Os três recursos antigos foram excluídos pela API oficial com UID e etag conferidos, revisão congelada e ausência de execuções ativas. O refresh normal reconheceu sua ausência; novos planos revisados removeram apenas os recursos restantes. Não houve edição manual do estado Terraform, recriação de dependências ou alteração dos dados da VM.

As raízes canônicas são [VM](../../deploy/google/vm/terraform/README.md), [apoio à produção](../../deploy/google/support/terraform/README.md) e [metadados da homologação encerrada](../../deploy/google/staging-retired/terraform/README.md). Seus prefixos continuam separados. Os estados antigos agora conservam somente 27 recursos de apoio à produção e 17 metadados da homologação; os dois planos completos posteriores retornaram **sem alterações**. O projeto/site padrão Firebase desativado e as APIs habilitadas de homologação permanecem como metadados, sem ambiente hospedado. A raiz histórica `deploy/google/terraform` não deve ser reaplicada.

A conferência final confirmou API, PostgreSQL e Caddy saudáveis, sem OOM, HTTPS de saúde 200 e consultas privadas sem autenticação 401. Os timers de saúde, backup e monitoramento estão ativos. O full `20261026-165430F`, o arquivamento de WAL corrente e zero WAL aguardando envio passaram; o histórico de sete dias ainda está se acumulando. Os seis segredos referenciados pela VM mantêm versões habilitadas e permissões específicas; imagens, bucket privado e geração fixa do bootstrap continuam acessíveis pelas permissões previstas. Essa inspeção de IAM não substitui o ensaio de restauração já registrado. O sinal operacional real `1` e as três localizações externas estavam saudáveis. A entrega por e-mail permanece comprovada pelo ensaio autorizado anterior, sem novo envio nesta retirada.

A projeção para um mês completo passa a **R$ 300–330**, composta por aproximadamente **R$ 278,61 de VM, discos e IP**, mais **R$ 20–50 para backups, serviços auxiliares e tráfego leve**. A provisão já inclui as cópias retidas; não somar backups outra vez. É estimativa, antes de impostos e créditos, sem medição consolidada de fatura ou tamanho faturável dos backups nativos. O mês da transferência ainda inclui o consumo anterior e a manutenção breve dos bancos antigos. O orçamento de alerta existente não foi alterado e não é teto de cobrança.

Recibos privados: `retirement-deleted-state-20261026T214030Z.json`, `final-retirement-verified-20261026T214028Z-7259e89d/result.json`, `vm-retained-permissions-20261026T213700Z-f95f504e/result.json`, `vm-ssh-20261026T214239Z.private.log`, `monitoring-policy-receipts/verify-20261026T214239Z-0152e3f8/result.json` e inventário `inventory-20261026T214036Z-51996a.json`. Planos, intenções e falhas intermediárias permanecem preservados para auditoria. O retorno agora exige reconstruir infraestrutura e restaurar/reconciliar a cópia atual; não há banco antigo pronto para religar.

## Histórico — suspensão às 17h24 de Brasília (20h24 UTC)

O responsável aceitou a migração e autorizou a conclusão da economia em uma etapa de até 30 minutos. A conferência anterior à execução confirmou a VM saudável, os backups e WAL correntes aprovados, origem congelada, nenhum job de migration ativo e nenhum outro cliente identificado nessa instância. O plano salvo e revisado foi aplicado uma única vez entre 17h21m57s e 17h23m07s: um update no Cloud SQL (`activation_policy: ALWAYS→NEVER`) e exclusão somente das duas forwarding rules `longbeach-api-http` e `longbeach-api-https` do IP antigo `8.228.239.120`.

A leitura posterior confirmou Cloud SQL `STOPPED/NEVER`, operação `UPDATE` concluída sem erro e zero forwarding rules no endereço antigo. Dados, disco SSD de 20 GB, configuração HA, backups/PITR e proteções contra exclusão foram preservados; cinco backups existentes retornaram `SUCCESSFUL`. O IP antigo, proxies, backend, certificados e a revisão congelada do Run continuam preservados. Workers do Run seguem desligados e minScale zero. Nenhum DNS, frontend, dado de negócio ou lançamento financeiro foi alterado nesta etapa.

Às 17h24, API, PostgreSQL e Caddy da VM estavam saudáveis e sem OOM; HTTPS de saúde respondeu 200 e consultas privadas sem autenticação responderam 401. Timers de backup, conferência e monitoramento permaneciam ativos, com full externo e WAL corrente aprovados e zero WAL aguardando envio. O sinal operacional `1` e as três checagens externas saudáveis foram recebidos depois da aplicação do plano. A entrega de e-mail já havia sido confirmada pelo responsável; o ensaio temporário permanece removido. O histórico de sete dias para PITR ainda está se acumulando; preservar as cópias anteriores.

Recibos privados: `managed-source-suspension-human-approval.json`, `managed-source-plan-20261026T195504Z-a47997ef/apply-20261026T202157Z-cf8ad0f3/result.json`, `managed-source-suspension-post-current.json`, `vm-ssh-20261026T202357Z.private.log`, `monitoring-policy-receipts/verify-20261026T202357Z-e3236e35/result.json` e o consolidado `managed-source-suspension-final-validation.json`.

A suspensão reduz o consumo da infraestrutura antiga; a economia ainda não foi conferida na fatura. Continuam sujeitos a cobrança VM, discos, cópias, IPs reservados e demais serviços retidos conforme consumo. Não aplicar tfvars antigos ou o módulo completo com a suspensão desativada: isso pode religar a origem. Uma reativação técnica requer plano separado e não autoriza tráfego, workers ou escrita na cópia antiga. Após gravações na VM, qualquer retorno exige transferir e reconciliar os dados atuais antes de reabrir a origem.

## Conferência em 26/10/2026

O registro A de `api.longbeach.quebranunca.com.br` foi alterado para `34.39.163.230` às 17h12 UTC, com confirmação nos servidores autoritativos. Às 17h16 UTC, o HTTPS público da VM passou com certificado válido, health 200 e acesso privado sem autenticação negado com 401. A API e as rotinas previstas do destino foram ativadas; a conferência de workers concluiu às 17h18 UTC. As flags específicas dos provedores bancários continuam preservadas.

A cópia **final** restaurada e reconciliada contém 60 tabelas, **13.609 linhas**, 99 totais numéricos e 27 migrations. O full final no GCS e o arquivamento de WAL passaram antes da ativação dos consumidores. A origem Cloud SQL permanece preservada, com CONNECT do runtime revogado e zero sessões desse usuário; os workers do Cloud Run estão desativados.

O emissor e seu timer foram ativados às 17h27 UTC, e as duas políticas de alerta foram criadas. O Google recebeu um ponto operacional real `1` às 17h28m59s UTC. Às 17h31m10s UTC, as checagens externas retornaram HTTP 200 nos EUA e na Europa e 503 em São Paulo; a confirmação de todas as regiões permanece pendente. A entrega de e-mail ainda não foi comprovada.

O login no navegador normal às 17h25 UTC atingiu a revisão antiga congelada, conforme os logs do Cloud Run, e falhou. O resolvedor local ainda retornava o IP anterior com TTL de aproximadamente 37 minutos às 17h28 UTC; Google e Cloudflare já retornavam o endereço novo. A ferramenta de navegador bloqueou a página interna de limpeza de cache, portanto nenhum ajuste de DNS/cache foi executado. Aguardar propagação natural e repetir a conferência.

Pendências de encerramento: validar login Google, renovação/saída e os fluxos usuais no navegador normal; conferir uptime saudável em todas as regiões e entrega dos alertas no canal autorizado; acompanhar estabilidade e custos. O Cloud SQL com HA ainda está RUNNABLE e o balanceador permanece provisionado, portanto a redução efetiva da cobrança ainda não foi realizada. Sua retirada depende do aceite e da conferência dos recursos substituídos, conforme os [gates do ADR-003](../adr/ADR-003-dominios-quebranunca-e-isolamento-railway.md) e o [ADR-015](../adr/ADR-015-google-vm-economia.md). Não reabrir a origem para gravações durante a estabilização.

### Retomada da validação às 16h04 de Brasília (19h04 UTC)

O resolvedor local e o Google passaram a retornar `34.39.163.230`. O recibo privado `monitoring-policy-receipts/verify-20261026T190422Z-17a74a0d/result.json` confirmou o ponto operacional real `1` e as três localizações externas saudáveis. A observação de 503 durante a propagação acima é histórica, não o estado desta conferência.

No Chrome normal, passaram acesso autenticado, leitura da agenda semanal, consulta do Caixa do Bar, Financeiro, saída da sessão e novo login Google com a conta autorizada. A recarga completa do Financeiro manteve o acesso e os dados, validando a renovação por cookie no fluxo real da aplicação. O reembolso de R$ 918,42 ao Gustavo está preservado como pendente; a conferência não registrou pagamento nem criou lançamentos financeiros. A captura de tela permanece em `outputs/google-vm-2026-10-26/financeiro-vm-validado.png`.

Às 16h08 de Brasília, API, PostgreSQL e Caddy estavam saudáveis, sem OOM. O check de backup aprovou full externo e WAL corrente, com zero arquivos WAL aguardando envio. O histórico de sete dias ainda não foi acumulado. O recibo é `vm-ssh-20261026T190805Z.private.log`.

A entrega por e-mail continua pendente: o responsável informou não ter recebido alerta. Às 16h15, a API oficial de alertas retornou zero incidentes no projeto; o canal estava habilitado e apontava para o endereço autorizado, e a busca dos eventos de notificação não retornou falhas. Isso não comprova entrega e não basta para concluir falha do canal. Os recibos são `monitoring-alerts-result.json` e `monitoring-notification-events-result.json`. Um ensaio de entrega deve ser identificado como teste e autorizado antes de enviar a notificação.

Às 16h11, a leitura da origem confirmou revisão congelada, `BackgroundJobs=false`, minScale zero, Cloud SQL HA ainda `RUNNABLE/ALWAYS` e as duas forwarding rules antigas preservadas. Os bancos existentes continuam preservados. A validação positiva não constitui aceite formal nem autoriza apagar ou suspender a origem; a estabilização e a retirada dos custos antigos permanecem pendentes.

### Entrega dos alertas confirmada

O responsável autorizou um ensaio identificado como `[TESTE DE ENTREGA] LongBeach`. A política temporária foi criada às 16h25, abriu o incidente às 16h30 e foi removida com conferência de ausência às 16h36 de Brasília. O responsável confirmou o recebimento do e-mail. API, banco, backups e políticas reais não foram alterados pelo ensaio; não há política temporária de entrega a remover.

Com isso, login/sessão, consultas usuais, disponibilidade nas três localizações, sinal operacional e entrega ao destinatário foram comprovados nesta validação. Isso é uma observação do período, sem garantia de disponibilidade futura. A retirada dos recursos gerenciados antigos continua separada: preparar plano restrito, conferir consumidores e registrar o aceite antes de executar. Até essa execução, Cloud SQL e as duas entradas antigas do balanceador continuam gerando cobrança.

Às 16h55, o plano salvo de suspensão passou com revisão independente: somente `activation_policy: ALWAYS→NEVER` no Cloud SQL e exclusão das duas forwarding rules de `8.228.239.120`. Run permaneceu integralmente sem alterações; dados, HA configurada, backups e proteções permaneceram idênticos. O estado remoto conferido é `longbeach/production`, separado do estado da VM. Passaram 46 testes Terraform e oito verificações offline do executor restrito ao plano. O inventário não identificou outros clientes nessa instância nem migrations ativas. Às 16h59, os três containers da VM estavam saudáveis, sem OOM, com backup externo e WAL corrente aprovados. Plano preparado não significa execução: o aceite final foi solicitado, e a suspensão ainda não foi aplicada.

### Ensaios anteriores ao corte

- Passaram 54 testes locais da preparação, 11 testes Terraform e os builds da API e do frontend. Essas verificações não representam execução de produção.
- A fixture sintética na VM comprovou backup GCS, restauração latest e PITR em destinos isolados, usando IAM da instância. A cópia lógica de **ensaio**, com 13.576 linhas, foi restaurada e reconciliada em PostgreSQL 18 no candidato, com API e proxy parados. Essa contagem histórica não é a da cópia final.
- A cópia mantém UTF8, libc e `en_US.UTF8`. A diferença revisada é a versão de collation da origem gerenciada, 2.19, para a nativa 2.36. O restore lógico recriou os índices, e índices e constraints passaram nas verificações de validade. A transferência preserva o domínio da aplicação e suas permissões; os dois grants administrativos específicos do provedor foram identificados e excluídos do destino, sem importar roles de Cloud SQL.
- O full nativo do repositório MAIN concluiu com aproximadamente 49 MB, 1.895 arquivos e 204 segundos. As restaurações latest e PITR dessa cópia real passaram em destinos isolados, preservando a cópia original e removendo os recursos próprios do ensaio. As evidências detalhadas permanecem privadas.
- A QA nativa do candidato passou em 30 verificações, incluindo leitura da agenda, caixa e Financeiro, autorização, TLS privado e 40 GETs concorrentes: todos retornaram 200, com p95 de 0,6407 segundo e sem OOM ou reinício dos serviços. A comparação antes/depois confirmou os dados preservados, e os containers temporários de QA foram removidos. Essa QA usou JWT de teste somente em memória; não comprova login Google nem refresh real depois do corte.

## O que muda

Uma VM de4 GiB em São Paulo hospeda a API, proxy HTTPS e PostgreSQL18 sem reserva automática. O frontend permanece no Firebase. Os endereços públicos, login, permissões, bancos/usuários da aplicação e as flags atuais dos provedores bancários são preservados. Não habilitar conciliação ou outro worker desativado apenas porque o host mudou. A decisão e os limites estão no [ADR-015](../adr/ADR-015-google-vm-economia.md).

O PostgreSQL escuta somente na rede Docker interna e não publica porta no host. O disco de dados é montado em `/var/lib/longbeach`; o bootstrap deve recusar inicialização se esse disco estiver ausente, em vez de gravar dados no boot. Configuração e segredos ficam em `/etc/longbeach` e `/run/longbeach`, fora do Git. Administrar pelo acesso individual autorizado do Google; não distribuir conta administrativa como credencial da API.

## Preparação e gate de publicação

1. Fixar e registrar commit da aplicação publicada, digest da API, imagem PostgreSQL/pgBackRest, proxy e imagem do sistema operacional. Construir e testar fora da VM; promover digest revisado. Documentar memória, disco e headroom. Nenhuma imagem `latest` é gate suficiente.
2. Conferir o plano Terraform e as permissões: somente VM, discos, rede necessária, bucket privado regional e conta da VM; sem5432 público, sem chaves de serviço e sem recursos de outro cliente. Preservar o estado da origem.
3. Provisionar candidato sem tráfego de produção e sem workers. Testar health, acesso não autenticado negado, login Google, refresh/logout, permissões, agenda, caixa e leitura do Financeiro. Não criar lançamentos fictícios em dados reais.
4. Executar fixture local de backup/restauração latest e PITR com sentinelas sintéticas. Na VM real, comprovar IAM automático, escrita/leitura no bucket e restauração em destino isolado. O ensaio deve conferir o ponto alcançado e a integridade, não apenas exit0 do processo.
5. Conferir monitoramento: disponibilidade externa, uso de memória/disco, falhas e idade de backup, arquivamento de WAL e notificações operacionais configuradas. Um arquivo `last-success` antigo não comprova proteção atual. Não encerrar sem informar quem recebe alertas e como acessar as evidências.

## Janela de transferência

Procedimento de transferência e de conferência. O corte, as validações de navegador e monitoramento, o aceite e a suspensão dos recursos substituídos estão registrados acima. Este roteiro permanece como referência para futuras operações.

1. Registrar a autorização e um responsável pelo corte. Conferir saúde da origem e backup recuperável. Suspender gravações com resposta explícita ao usuário; interromper entrada por API, webhooks e processos administrativos que possam gravar.
2. Desligar workers da origem, drenar requisições, esperar tarefas em voo e conferir sessões/transações. O destino continua com workers bloqueados. Uma flag em arquivo sem inspeção do processo/revisão não comprova parada.
3. Fazer a cópia final nativa PG18 da origem congelada, com papéis/permissões previstos, manifestos de schema/dados, contagens, totais, sequências, tamanho e SHA256. Guardar os arquivos somente nos locais privados autorizados.
4. Restaurar somente em banco/diretório vazio do candidato; não sobrescrever a base ativa. Executar no máximo uma migration explícita se houver pendência previamente revisada; se não houver, registrar zero pendência. Não rodar migrations em cada startup nem seeds.
5. Conferir schema e histórico, dados, sequências, totais relevantes, isolamento de usuários e privacidade da API/banco. Fazer full do banco reconciliado e verificar WAL/GCS. Documentar as diferenças aceitadas; não ignorar divergências de dados como metadados.
6. Publicar o proxy/TLS e mudar somente o endereço da API na zona existente. O frontend e login mantêm seus domínios e cookies. Conferir resposta pelo DNS público e pelo navegador normal. Só liberar os workers previstos depois de comprovar a origem parada e o destino único; manter desativados os provedores que estavam desativados.
7. Validar login, renovação, saída, permissões, agenda, caixa, pagamentos e as tarefas efetivamente habilitadas. Conferir persistência de qualquer ação real autorizada, sem duplicação. Registrar a aceitação e observar erros/recursos antes de descomissionar a origem.

## Backup e recuperação

O [runbook de backup](../../deploy/google/vm/backup/README.md) contém os arquivos e contratos de instalação. pgBackRest2.59.3 roda no mesmo container PostgreSQL18, como UID999. Usa IAM da VM para GCS privado em `southamerica-east1`, sem chave JSON. Há full diário, WAL contínuo e retenção por tempo de oito dias; não há lifecycle independente que apague WAL necessário. A janela de sete dias começa a existir depois de acumulado esse histórico.

O operador confere os timers `longbeach-backup.timer` e `longbeach-backup-check.timer`, os eventos `LONGBEACH_BACKUP_FAILURE` e `/var/lib/longbeach/backup-state`. A verificação executa um switch de WAL, valida envio ao repositório e idade do full. Se o GCS ficar inacessível, o WAL se acumula no disco local: reparar a causa; não apagar WAL para ocultar o problema. Alertar antes de85% do disco.

Na perda do host, recriar VM/disco, usar o mesmo artefato PostgreSQL/pgBackRest e restaurar do bucket para diretório vazio. Manter API/workers desligados até conferir replay, contagens, totais, sequências e permissões. Uma recuperação para horário anterior pode perder gravações recentes; apurar e reconciliar. Não há garantia de troca automática entre zonas ou de tempo fixo de recuperação.

## Retorno e encerramento

Antes da primeira gravação no destino, o retorno pode reutilizar a origem congelada depois de retirar o candidato do tráfego e confirmar um único gravador. Depois de gravações na VM, congelar a VM e restaurar/reconciliar sua cópia atualizada na infraestrutura de retorno. Conferir novamente dados, migrações e sessão; só então mover tráfego e habilitar workers. Nunca religar o Railway ou uma base antiga com dados divergentes.

Preservar a origem até aceite explícito da migração e comprovação de recuperação. Depois, remover somente os recursos comprovadamente substituídos, mantendo as cópias e retenções necessárias. Revogar acessos temporários próprios e registrar custos que continuam existindo. Corte de tráfego aplicado não significa que a estabilização, o monitoramento ou a redução de custos foram encerrados.
