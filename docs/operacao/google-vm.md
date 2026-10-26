# LongBeach — operação da VM econômica Google

Corte de infraestrutura aplicado em 26/10/2026, na janela autorizada. A API e o banco passaram para a VM; a conferência final no navegador, a estabilização e a retirada dos recursos anteriores seguem abaixo. Os planos, hashes e recibos de execução permanecem privados; nunca versionar dumps, credenciais ou dados pessoais.

## Conferência em 26/10/2026

O registro A de `api.longbeach.quebranunca.com.br` foi alterado para `34.39.163.230` às 17h12 UTC, com confirmação nos servidores autoritativos. Às 17h16 UTC, o HTTPS público da VM passou com certificado válido, health 200 e acesso privado sem autenticação negado com 401. A API e as rotinas previstas do destino foram ativadas; a conferência de workers concluiu às 17h18 UTC. As flags específicas dos provedores bancários continuam preservadas.

A cópia **final** restaurada e reconciliada contém 60 tabelas, **13.609 linhas**, 99 totais numéricos e 27 migrations. O full final no GCS e o arquivamento de WAL passaram antes da ativação dos consumidores. A origem Cloud SQL permanece preservada, com CONNECT do runtime revogado e zero sessões desse usuário; os workers do Cloud Run estão desativados.

O emissor e seu timer foram ativados às 17h27 UTC, e as duas políticas de alerta foram criadas. O Google recebeu um ponto operacional real `1` às 17h28m59s UTC. Às 17h31m10s UTC, as checagens externas retornaram HTTP 200 nos EUA e na Europa e 503 em São Paulo; a confirmação de todas as regiões permanece pendente. A entrega de e-mail ainda não foi comprovada.

O login no navegador normal às 17h25 UTC atingiu a revisão antiga congelada, conforme os logs do Cloud Run, e falhou. O resolvedor local ainda retornava o IP anterior com TTL de aproximadamente 37 minutos às 17h28 UTC; Google e Cloudflare já retornavam o endereço novo. A ferramenta de navegador bloqueou a página interna de limpeza de cache, portanto nenhum ajuste de DNS/cache foi executado. Aguardar propagação natural e repetir a conferência.

Pendências de encerramento: validar login Google, renovação/saída e os fluxos usuais no navegador normal; conferir uptime saudável em todas as regiões e entrega dos alertas no canal autorizado; acompanhar estabilidade e custos. O Cloud SQL com HA ainda está RUNNABLE e o balanceador permanece provisionado, portanto a redução efetiva da cobrança ainda não foi realizada. Sua retirada depende do aceite e da conferência dos recursos substituídos, conforme os [gates do ADR-003](../adr/ADR-003-dominios-quebranunca-e-isolamento-railway.md) e o [ADR-015](../adr/ADR-015-google-vm-economia.md). Não reabrir a origem para gravações durante a estabilização.

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

Procedimento de transferência e de conferência. O corte aplicado está registrado acima; os itens de navegador, monitoramento, aceite e retirada da origem continuam pendentes nesta atualização.

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
