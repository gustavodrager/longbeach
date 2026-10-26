# Backup PostgreSQL 18 da VM

Este diretório prepara proteção fora da VM; a existência dos arquivos não comprova publicação ou restauração em produção. Não contém chave de serviço, senha, dump ou dados de clientes.

## Contrato de implantação

- `Dockerfile`: imagem oficial PostgreSQL 18.6 Bookworm fixada por digest, mais `pgbackrest=2.59.3-1.pgdg12+1` do repositório PGDG assinado. O build deve falhar se a versão não estiver disponível; não aceitar silenciosamente outra versão. Construa fora da VM, registre o digest final e use o mesmo artefato na restauração. O pgBackRest do Debian Bookworm sem PGDG é antigo para PostgreSQL 18.
- O serviço Compose chama-se `postgres`, projeto `longbeach`, sem porta publicada. PostgreSQL e pgBackRest executam como UID/GID `999:999`. O entrypoint oficial inicializa e troca o usuário; comandos de backup usam explicitamente o UID sem privilégio.
- `PGDATA=/var/lib/postgresql/18/docker`; `/var/lib/longbeach/postgres` no disco de dados monta `/var/lib/postgresql`. O runner recusa o caminho se `/var/lib/longbeach` não for um ponto de montagem.
- `/etc/longbeach/backup/pgbackrest.conf` (root:999, 0640) monta somente leitura em `/etc/pgbackrest/pgbackrest.conf`.
- Diretórios persistentes `/var/lib/longbeach/pgbackrest/spool`, `log`, `lock`, UID/GID999, montam respectivamente `/var/spool/pgbackrest`, `/var/log/pgbackrest`, `/var/run/pgbackrest`.
- O PostgreSQL inicia com `wal_level=replica`, `archive_mode=on`, `archive_timeout=60s` e `archive_command=pgbackrest --stanza=longbeach archive-push %p`.
- A configuração usa `pg1-user=postgres` e Unix socket local. O superusuário administrativo não é a credencial da API. A API conserva usuário e permissões próprios.

## Repositório e retenção

`render-config.py --manifest /etc/longbeach/bootstrap.json` lê apenas `backup.bucket` e `backup.prefix` e imprime a configuração. A conta de serviço anexada à VM recebe acesso somente ao bucket/prefixo LongBeach; `repo1-gcs-key-type=auto` usa credenciais temporárias da instância. Não instalar JSON de chave nem montar credenciais do SDK. O bucket é privado, com prevenção de acesso público, acesso uniforme e região `southamerica-east1`.

Há um full diário, retenção por **tempo de oito dias** e WAL contínuo desde o full mais antigo retido. Não definir retenção de WAL independente, lifecycle GCS para apagar objetos, ou fila assíncrona que possa descartar segmentos. A margem de oito dias preserva pelo menos sete dias quando o histórico já existe e a cadeia está íntegra. No início, a janela cresce a partir do primeiro backup; não é possível recuperar sete dias anteriores à criação.

`archive-push` é síncrono: falha do GCS faz o PostgreSQL conservar WAL e tentar novamente. Uma falha prolongada pode encher o disco e interromper o banco; não usar `archive_command=true`, não apagar `pg_wal`, e não marcar arquivo como enviado para liberar espaço. Corrigir acesso/espaço e verificar a cadeia. A janela de recuperação depende dos segmentos já enviados; `archive_timeout=60s` é uma meta operacional, não garantia de perda zero.

O GCS cifra dados em repouso e pgBackRest verifica TLS. A conta da VM precisa criar, ler, listar e excluir objetos do repositório para backup e expiração. Não bloquear exclusões com uma retenção de bucket incompatível com a ferramenta. Isso protege contra perda da VM, mas não contra um administrador ou credencial de repositório comprometida que apague o bucket; uma política adicional de imutabilidade exige projeto e teste próprios.

## Ativação pelo bootstrap revisado

O bootstrap do host instala `run.py` em `/opt/longbeach/backup/run.py` e os cinco arquivos `.service`/`.timer` em `/etc/systemd/system`. Deve criar `/etc/longbeach/backup-runner.json` (root:root, 0600) a partir de `backup-runner.example.json`, com o digest final da imagem, caminhos reais do Compose/env e SHA256 do arquivo de configuração renderizado. O exemplo contém valores inválidos propositalmente e não deve ser instalado sem preenchimento.

Depois que o banco de destino tiver sido reconciliado e estiver operando como primário privado:

```sh
sudo python3 /opt/longbeach/backup/run.py bootstrap
sudo systemctl daemon-reload
sudo systemctl enable --now longbeach-backup.timer longbeach-backup-check.timer
sudo systemctl list-timers 'longbeach-backup*'
```

O comando `bootstrap` cria somente a stanza, verifica o arquivamento e faz o primeiro full. É idempotente para a mesma stanza/cluster, mas não autoriza reutilizar prefixo de outro cluster. O primeiro `check` pode falhar enquanto a stanza ainda não tiver sido criada: resolver a causa antes de habilitar o corte. Nenhum comando do runner restaura ou apaga banco/stanza.

O escopo das opções depende do comando: no pgBackRest 2.59.3, `stanza-create` e `check` operam os repositórios configurados e rejeitam `--repo=1`. O runner acrescenta essa seleção somente a `backup` e `info`; `restore` também aceita seleção explícita quando usado no ensaio isolado. A regressão foi conferida com a CLI nativa, além dos testes do runner. Não reutilizar uma lista base com `--repo` indiscriminadamente. O runner limpa o ambiente herdado antes de invocar pgBackRest, para impedir que variáveis `PGBACKREST_*` substituam a configuração revisada.

`flock` no host serializa `bootstrap`, `full` e `check`. As travas nativas do pgBackRest protegem o repositório e deixam `archive-push` continuar durante o backup. Um `timeout` dentro do container encerra o comando antes do limite do cliente Docker; matar somente `docker exec` não garantiria isso. Não executar restauração no mesmo diretório ou iniciar outro processo manual concorrente. Se o host perder o processo, conferir processos/travas antes de qualquer repetição; não remover locks para contornar a proteção.

## Monitoramento

O timer diário roda às 06h UTC, com até dois minutos de dispersão. Outro timer verifica a cada cinco minutos, forçando um WAL com `pgbackrest check` e conferindo sua chegada ao repositório mesmo se o banco estiver ocioso. Valida full com menos de 26h, identidade PG18, configuração de archive, ausência de falha de archive posterior ao último sucesso, fila pequena e disco abaixo de 85%.

Registros privados em `/var/lib/longbeach/backup-state`: `last-success.json`, `last-full-success.json` e `last-failure.json`. Uma falha não sobrescreve o último sucesso. `seven_days_history_accumulated` indica apenas idade do histórico, não atestado de que todos os pontos foram restaurados. Um teste de restauração continua obrigatório.

Os serviços retornam erro e emitem `LONGBEACH_BACKUP_FAILURE` no journal/syslog. O operador deve ligar esse evento e ausência de sucesso por mais de dez minutos aos alertas da operação; só haver um timer habilitado não comprova alerta externo. Também monitorar indisponibilidade da VM e uso de disco: a verificação interna não roda quando o host está desligado.

## Ensaio e restauração

Validação local reproduzível (somente dados sintéticos; o modo padrão não executa Docker):

```sh
python3 -B -m unittest discover -s deploy/google/vm/backup -p 'test_*.py'
python3 -B deploy/google/vm/backup/tests/smoke-posix.py --image IMAGEM_LOCAL_REVISADA --execute
```

O smoke usa peer local, usuário postgres/UID999, cap-dropALL, filesystem somente leitura, rede `none`, nenhum host port e volumes próprios identificados por runid. Latest e PITR usam volumes distintos; confere a fonte original antes de remover os recursos da fixture. Recibos privados ficam em `tests/.runs/`, ignorados pelo Git. A imagem local é inspecionada e usada com `--pull=never`.

1. Antes do corte, executar fixture Docker com dados sintéticos, sem porta publicada e repositório POSIX isolado: `render-config.py --posix-path /repo`. Validar full, gravação posterior, envio de WAL, restauração latest e restauração para um horário anterior à segunda gravação. Conferir schema, contagens, sequência e o registro sentinela presente/ausente no ponto correto. Remover somente os recursos próprios da fixture.
2. Antes de aceitar produção, repetir leitura/restauração do **repositório GCS real** em diretório vazio e isolado, usando a mesma imagem/digest e conta de serviço autorizada. A prova POSIX local não comprova IAM, metadata, GCS ou transferência real.
3. Em desastre, provisionar host limpo e acesso ao mesmo bucket privado. Registrar o horário UTC a recuperar, versão/digest e stanza. Preservar o disco antigo para análise. Parar qualquer gravador e todos os workers antes de promover uma recuperação.
4. Usar `pgbackrest --stanza=longbeach --pg1-path=CAMINHO_VAZIO --type=time --target='HORARIO_UTC' --target-action=promote --archive-mode=off restore` no novo diretório, como UID999. O caminho deve estar vazio, fora do PGDATA ativo, e montado somente no container de restauração. Sem `--delta` ou remoção do diretório ativo. O `restore_command` buscará WAL pelo pgBackRest; iniciar PostgreSQL18 privado, com API/workers desligados, para completar o replay.
5. Conferir o log nativo de recuperação, o ponto efetivamente alcançado, banco/roles/grants, schema/migrations, contagens, totais e sequências. Recuperação para data passada descarta mudanças posteriores nesse candidato; reconciliá-las antes da retomada quando necessário.
6. Após aceite, promover o volume recuperado pelo procedimento de implantação, habilitar arquivamento, fazer novo full e conferir backup. Somente então liberar API e workers preservando suas flags. Registrar RPO e tempo efetivamente medidos; não prometer RTO fixo.

Snapshots de disco não substituem backup consistente com WAL. Nunca restaurar por cima de novos lançamentos nem tratar apenas DNS como retorno dos dados.

## Referências primárias

- [Imagem oficial PostgreSQL](https://github.com/docker-library/postgres), incluindo o layout PG18 em `/var/lib/postgresql`.
- [Pacotes PGDG Bookworm](https://apt.postgresql.org/pub/repos/apt/dists/bookworm-pgdg/main/binary-amd64/Packages.gz).
- [pgBackRest: suporte PostgreSQL18 desde2.55](https://pgbackrest.org/release.html).
- [pgBackRest: GCS auto, retenção por tempo e WAL](https://pgbackrest.org/configuration.html).
- [pgBackRest: backup, restore e PITR](https://pgbackrest.org/user-guide.html).
