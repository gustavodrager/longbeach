# Runtime candidato da VM LongBeach

Este diretório prepara a operação da **versão já publicada**, por digest. Não cria
migration, não ativa produção e não reativa APIs bancárias. A implantação, a cópia
final e a mudança de DNS dependem dos controles da operação de transferência.

## Contrato com o host

- Instalar este diretório em `/opt/longbeach/runtime`, proprietário root, sem escrita
  por grupos/terceiros. Docker Engine e Compose v2.26 ou posterior são requisitos.
- O disco persistente deve estar montado **exatamente** em `/var/lib/longbeach`.
  `DATA_DISK_UUID` deve coincidir com `findmnt`; um diretório no disco de boot não
  serve. O preflight nunca cria diretórios nem formata/monta discos.
- `/etc/longbeach/runtime.env`: root:root 0600, somente as opções públicas do
  exemplo. Fixar os digests da API publicada e da imagem PostgreSQL18 com pgBackRest
  preparada em `../backup`. Baixar/conferir imagens antes de iniciar; a unit não
  constrói nem baixa imagens durante o start.
- Preparar segredos por um serviço do host antes de `longbeach-runtime.service`,
  inclusive após reboot. `/run` é temporário. A montagem não substitui a obtenção
  autorizada dos segredos nem a restauração/conferência do banco.

| Caminho no host | Proprietário e modo | Uso |
| --- | --- | --- |
| `/run/longbeach/appsettings.Production.json` | root:1654, 0640 | Configuração completa da API, montada somente leitura |
| `/run/longbeach/postgres-admin-password` | root:999, 0640 | Senha administrativa do PostgreSQL; nunca entregue à API |
| `/etc/longbeach/backup/pgbackrest.conf` | root:999, 0640 | Configuração do backup; não montar na API |
| `/run/longbeach/tls` | root:1000, 0750 | Certificado e chave preparados antes do ensaio HTTPS |
| `tls/fullchain.pem` e `tls/privkey.pem` | root:1000, 0640 | Certificado do host e chave correspondente |
| `/var/lib/longbeach/postgres` | 999:999, 0700 | Montado em `/var/lib/postgresql`; PGDATA `/var/lib/postgresql/18/docker` |
| `/var/lib/longbeach/pgbackrest/{spool,log,lock}` | 999:999, 0700 | Estado e logs persistentes do pgBackRest |
| `/var/lib/longbeach/caddy/{data,config}` | 1000:1000, 0700 | Certificados/estado do Caddy; tratar como privados |

GIDs são numéricos para os processos dos contêineres; não é necessário conceder
esses grupos a usuários humanos. O arquivo da API contém a conexão **runtime**
`Host=postgres;Port=5432;Database=longbeach;Username=longbeach_runtime;...`,
`SSL Mode=Disable` somente nessa rede local e pool máximo de 30 conexões. Manter
senhas com a cotação correta de connection strings ADO/Npgsql. Não montar conexão
administrativa ou migradora na API. O arquivo PostgreSQL de senha inicial não
altera a senha de um cluster que já foi inicializado.

Preservar issuer, audience, chave JWT, Google client IDs, CORS, cookies e flags da
versão publicada. O preflight exige o modo bancário por importação e rejeita flags
que reativem APIs ou mutations de startup. O Compose também impõe essas proteções
por environment; valores sensíveis ficam no arquivo JSON, fora de environment e
de `docker inspect`.

## Redes e proteção da identidade da VM

- `edge` é `172.29.10.0/24`: Caddy `.11`, API `.10`. É a única rede de saída da API.
- `database` é `172.29.11.0/24`, internal: API `.10`, PostgreSQL `.20`.
- `archive` é `172.29.12.0/24`: somente PostgreSQL `.20`, para GCS/identidade da VM.
  Como `database` é internal, a rota de saída do PostgreSQL deve usar `archive`;
  conferir isso no ensaio com a versão real do Docker.
- Somente Caddy publica portas host, TCP80/443. Não publicar PostgreSQL nem API,
  inclusive temporariamente. Não montar socket Docker ou diretórios de segredos
  do host dentro da aplicação.
- O host deve instalar regras `DOCKER-USER` **antes de iniciar o runtime** para
  DROP de destino `169.254.169.254/32`, TCP80/443 (`-p tcp -m multiport --dports 80,443`),
  com origem `172.29.10.0/24` e `172.29.11.0/24`. Preservar UDP/TCP53 para DNS.
  O preflight confere essas duas regras exatas. A identidade
  privilegiada da VM deve ficar inacessível a API/Caddy. Conferir de dentro dos
  dois contêineres que a metadata não responde e que saída HTTPS/DNS ainda funciona.
  Conferir também que somente a interface `archive` do PG alcança a identidade.
  A topologia não habilita IPv6; se isso mudar, proteger também a metadata IPv6.
- A API confia no único proxy acessível. Caddy substitui Host e X-Forwarded-For/
  Proto pelo pedido real e remove os outros headers encaminhados do cliente.
  Não remover esse tratamento nem expor a porta8080 da API.
  O transporte para a API usa HTTP/1.1 e no máximo40 conexões, para não substituir
  o limite anterior de40 requisições por concorrência ilimitada. Espera em fila no
  proxy e capacidade de importações continuam sujeitas ao ensaio.

## HTTPS, início e reinício

`Caddyfile.certificate` é o padrão. Antes do corte, obter certificado canônico por
DNS-01 ou usar certificado de ensaio cuja CA seja explicitamente confiada pelo
cliente local. O preflight verifica nome, validade mínima de uma hora e o par
chave/certificado; **não confirma a cadeia pública**. Ensaiar HTTPS normal,
login, refresh, cookies e CORS no endereço canônico antes de transferir o tráfego.
Um certificado de teste não aprova produção.

`Caddyfile.automatic` permite emissão/renovação ACME pelo próprio Caddy quando o
DNS público e portas80/443 já atingem a VM. Essa variante não emite um certificado
canônico antecipadamente apenas por estar em execução. A troca da variante deve
ser explícita e a emissão/renovação precisa ser verificada; não deixar a operação
dependendo de copiar manualmente certificados sem renovação controlada.

A unit executa os guards do host, inicia **somente PostgreSQL** com `--no-deps`
e `--wait`, confere a compatibilidade da imagem API com o schema real e só então
inicia API/Caddy. Não faz build, pull, migration ou criação de banco. O timeout
de start cobre as duas fases de espera. Uma recusa de compatibilidade mantém a
API sem novo start e preserva PostgreSQL; ela não autoriza restaurar ou apagar dados.
Para inicializar/restaurar o candidato, conferir imagens, mount e secrets pelo
guard do host antes de iniciar somente PostgreSQL. O preflight exige
`PG_VERSION=18` já existente. Não iniciar API/Caddy contra banco vazio, usar
`docker compose down -v` ou apagar dados para corrigir um start.

### Compatibilidade da API com o schema 29

Este preflight acompanha a release `20261029121159_UnifiedCustomers`. Instalar
sua unit/guard no corte dessa release, com escritores pausados e após o job de
migration conferido. Não trocar preventivamente o guard de um host no schema 28
e tentar reiniciá-lo: versões sem a prova nova serão recusadas.

A imagem API contém labels constantes versionadas: `com.longbeach.api.customer-registry=v1`,
`com.longbeach.api.schema.migration-count=29`, `com.longbeach.api.schema.latest=20261029121159_UnifiedCustomers`
e `com.longbeach.api.schema.migrations-sha256=c9f2d161a72410894b9b9f4af1ad243e305f61e1548f94393deac32aeeb6cf11`.
O Dockerfile calcula esse hash dos atributos reais de todas as migrations,
incluindo as manuais sem Designer, e falha no build se houver divergência. A
publicação de imagens também executa os testes do contrato. Nenhum build arg,
flag de ambiente ou número de versão livre substitui essa prova.

O preflight inspeciona a imagem local por digest, confere `RepoDigests` e
`linux/amd64`; depois identifica o PostgreSQL do Compose por ID, labels, imagem
e mount de dados. Pelo usuário local `postgres`, sem senha em argumentos,
consulta apenas o histórico de migrations de `longbeach` em transação READ ONLY.
Exige o conjunto completo de 29 IDs e o mesmo hash da imagem/guard. API antiga
sem labels, schema parcial, schema futuro, imagem ausente ou banco inacessível
são recusados; não há pull, migração automática ou fallback para um estado informado
manualmente. Os digests de índice e de config OCI podem ser diferentes.

`preflight.py --host-only` serve apenas à preparação do host e informa
`api_start_permitted=false`. A chamada sem essa opção é obrigatória imediatamente
antes de qualquer promoção/retorno que use `compose up ... api` diretamente,
sempre sob a janela/lock exclusivo da release. O caminho normal da unit executa
esse gate completo antes de seu `ExecStart`. Não contornar o gate com um start
manual nem usar readiness 200 como prova de compatibilidade. O gate verifica
admissão; escritores já em execução devem ser pausados antes da migration.
Preflight, Compose da unit e inspeção de saúde usam explicitamente o mesmo
socket local `/var/run/docker.sock`, sem depender do contexto salvo do Docker CLI.

O retorno da interface mantém a API compatível e seu digest. Não apontar
`API_IMAGE` para artefato anterior sem essa prova, não executar Down após uso e
não reescrever contatos históricos para tentar tornar uma API antiga compatível.

`WORKERS_ENABLED` começa false. Para tornar true, os dois gates
`VM_PRODUCTION_CUTOVER_CONFIRMED` e `SOURCE_WORKERS_STOPPED_CONFIRMED` também
precisam estar true após a conferência da operação. O modo importação continua
bloqueando os workers bancários; habilitar BackgroundJobs não autoriza retomá-los.

PostgreSQL conserva restart `unless-stopped`. API/Caddy usam `on-failure:5`:
repetem até cinco falhas de processo com saída diferente de zero, mas não são
iniciados automaticamente pelo restart do daemon. A política é descrita na
[documentação do Docker](https://docs.docker.com/engine/containers/start-containers-automatically/).
Essa recuperação limitada repete o mesmo artefato admitido; migrations continuam
exigindo pausa explícita dos escritores. Todos têm healthchecks, limites de
memória/CPU/PIDs, filesystem raiz somente leitura e logs Docker rotacionados.
**Unhealthy não provoca restart automático.**

No boot, a unit habilitada inicia API/Caddy somente após o gate. `PartOf=docker.service`
propaga um restart controlado do Docker à unit, repetindo a sequência completa.
Uma parada isolada do daemon, falha que esgote as tentativas ou saída limpa da API
pode deixar o serviço indisponível: conferir a causa e recuperar por
`systemctl restart longbeach-runtime.service`, nunca por `docker start/restart api`.
O timer de saúde só registra estado em journald e retorna falha quando precisa de
atenção; não reinicia contêineres nem contorna o gate. Integrar essas falhas e o
monitor de backup às notificações operacionais do host. Não reiniciar PostgreSQL
indiscriminadamente por uma falha de saúde.

Na instalação da release, conferir que os contêineres existentes foram atualizados
para essas políticas antes de encerrar a janela: copiar o YAML não altera a política
de um contêiner já criado. Ensaiar boot/restart controlado do daemon e conferir a
ordem no journal durante a operação aprovada; os testes locais de configuração
não substituem esse ensaio de disponibilidade na VM.
O Caddy roda com UID1000 e somente a capability `NET_BIND_SERVICE`: o binário
oficial tem essa file capability e precisa dela no bounding set para executar.
API e PostgreSQL não recebem capabilities adicionais.

Os limites iniciais são PostgreSQL1,5GiB, API1GiB e Caddy256MiB; sobram recursos para
SO/Docker no host4GiB. São candidatos a teste, não capacidade comprovada. Ensaiar
importações e concorrência com os limites reais antes do corte. `max_wal_size=1GB`
é um alvo de checkpoint, não limite de disco: falhas de archive podem acumular WAL;
o monitor de backup/disco é obrigatório. Sem réplica, falha do host exige recuperação.

## Verificação local

`python3 -B -m unittest discover -s deploy/google/vm/runtime -p 'test_*.py' -v`
confere os gates e o modelo resolvido de Compose sem cloud, segredos ou banco real.
Os ensaios Docker de boot, restore, WAL/GCS, HTTPS e permissões complementam esses
testes; `compose config` sozinho não confirma funcionamento.

`smoke-local.py` usa a imagem API publicada fixada, a imagem local de backup,
credenciais/banco fictícios, certificado de CA local sem instalação no SO, portas
em loopback e dados em volumes Linux descartáveis. Usar **Python3 com OpenSSL3**;
o LibreSSL fornecido pelo macOS falhou no ensaio e não deve ser contornado com
`-k`/desativação de validação. O cliente padrão mantém validação de CA e hostname
canônico, com conexão TCP restrita a127.0.0.1. O modo `--https-client curl` usa
`--cacert`/TLS1.2, quando houver um curl compatível.

O ensaio histórico `smoke-local.py` verifica 27 migrations, falta de sessão/permissão, CORS, modo importação,
cookies e80 GETs a40 concorrentes. Ele não verifica login Google, refresh de sessão
real, importações com volume de produção, backup/PITR ou firewall de metadata.
Remove seus contêineres, redes, volumes e diretório de fixtures ao terminar. Falhas
guardam somente diagnóstico privado de dados fictícios no diretório temporário
do operador; não há leitura de dados ou segredos de produção.
Ele não é a prova de compatibilidade da release 29; essa conferência usa os testes
do preflight e o ensaio específico documentado no runbook da release.

Imagem Caddy oficial2.11.7, índice observado em26/10/2026:
`sha256:504a44d7d74bd2bc28a66afc4774912fc21223ca8a67734af1c54ab2f999b489`;
filho Linux/AMD64 `sha256:04913b1da43339a40ad1ea87827d70a576ac5aa6cf674c6e24fdca675887533a`.
Fontes: [imagem oficial](https://hub.docker.com/_/caddy),
[proxy/headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy),
[configuração Docker Compose](https://docs.docker.com/reference/compose-file/services/).
