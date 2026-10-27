# Preparação do host candidato

`bootstrap-vm` é instalado pelo pacote privado verificado pelo loader Terraform. Ele aceita apenas o manifest canônico `/etc/longbeach/bootstrap.json` com owner root e modo 0600, schema 1 e gates de restore/runtime/workers fechados. Confere Debian 13 amd64, projeto e nome da VM por metadados. Não deve ser executado no Mac, na origem ou em outro servidor.

## Primeira preparação

O loader chama `--prepare-only`, sem autorização para formatar. Uma VM nova com disco ainda sem filesystem deve recusar essa primeira tentativa. Depois de conferir o plano, o operador acessa pelo IAP e executa explicitamente o `bin/bootstrap-vm` dentro do diretório do pacote identificado pelo SHA:

```text
sudo /opt/longbeach/bootstrap/SHA_DO_PACOTE/bin/bootstrap-vm --manifest /etc/longbeach/bootstrap.json --prepare-only --initialize-empty-disk
```

Não substituir `SHA_DO_PACOTE` sem conferir o pacote instalado. `--initialize-empty-disk` autoriza somente o disco GCE por-ID `google-longbeach-postgres`, inteiro, 20 GiB, sem partições/mount/signatures, distinto do disco raiz. O helper confere `lsblk`, `wipefs --no-act` e `blkid`, repete a prova e usa `mkfs.ext4` sem `-F`. Nunca apaga assinaturas para forçar a inicialização. Filesystem existente só é aceito como ext4 com UUID; `/etc/fstab` usa esse UUID, e um conflito ou ponto de montagem diferente recusa a execução. Não há autorização para sobrescrever dados existentes.

Publique previamente a versão do novo secret administrativo da VM fora do Terraform. Se a versão não existir, o helper falha fechado. Uma preparação incompleta pode ser repetida com o mesmo pacote verificado; não precisa nem autoriza formatar novamente um filesystem ext4 já criado. Um runtime em execução ou gates de corte já confirmados fazem `prepare` recusar, para não resetar a produção. Docker já instalado com daemon inativo, ou estado/configuração persistida sem o binário, também exige revisão manual: iniciar o daemon poderia retomar contêineres antigos. O prepare não contorna essa recusa automaticamente.

O prepare instala `docker.io`, `docker-cli`, `docker-compose` e utilitários dos repositórios assinados do Debian 13, sem adicionar outro repositório Docker. Exige Compose 2.26+. Inicia apenas o daemon Docker. Faz pull por digest para linux/amd64 das três imagens; login no AR recebe token somente pelo stdin e usa `DOCKER_CONFIG` privado temporário sob `/run`, removido após o pull. Não herda credenciais do SDK ou configurações do Docker da sessão administrativa.

## Configuração e fronteiras

- Disco persistente: `/var/lib/longbeach`. PostgreSQL/pgBackRest UID/GID 999; diretórios do Caddy UID/GID 1000. Não faz `chown` recursivo ou inicializaçãoPostgreSQL.
- Configuração pública: `/etc/longbeach/runtime.env`, root 0600, com imagens/domínios/UUID e três gates falsos. Não contém senha.
- Secrets: `/run/longbeach/appsettings.Production.json` root:1654/0640, senhaadmin root:999/0640 e diretório TLS root:1000/0750. Exige `/run` em tmpfs. Apenas referências do Secret Manager versionadas trafegam na configuração; valores e token ficam em memória ou nesses arquivos efêmeros. O administrador PostgreSQL novo não reutiliza a senha do runtime.
- Runtime/backup: arquivos sob `/opt/longbeach`, units copiadas, configuração pgBackRest root:999/0640 e runner-manifest root 0600. Não copia certificados fictícios.

O helper não inicia PostgreSQL, API ou Caddy, não executa Compose `up`/`run`, initdb, SQL, restore, migrations ou pgBackRest `bootstrap`. Não habilita o runtime ou timers. Depois de `systemctl daemon-reload`, entrega somente um recibo público de preparação, sem credenciais.

## Reinicialização e metadados

O drop-in Docker exige o disco montado, `longbeach-metadata-firewall.service` e `longbeach-secrets.service` antes do daemon. Isso é necessário porque `restart: unless-stopped` pode restaurar contêineres sem esperar a unit do runtime. O firewall cria/verifica as regras DOCKER-USER do backend iptables-nft antes dos contêineres retomarem. Bloqueia somente TCP 80/443 para 169.254.169.254 a partir das redes web 172.29.10.0/24 e 172.29.11.0/24. Não bloqueia DNS na porta 53 nem a rede de archive 172.29.12.0/24, que usa ADC para GCS. A saída HTTP do host continua apta a buscar secrets. Esse desenho depende das sub-redes do Compose revisado e não autoriza outros contêineres/redes no host.

`longbeach-secrets.service` obtém secrets novamente antes de `longbeach-runtime.service` e preserva o diretório efêmero durante sua execução oneshot. O modo `--refresh-secrets-only` não instala pacotes, monta/formata discos ou muda gates. `--metadata-firewall-only` só confere identidade e regras próprias; ambos são chamadas internas das units revisadas.

O modo `Caddyfile.certificate` serve apenas ao ensaio com PEMs fornecidos pelo operador em `/run`. O helper não recupera esses PEMs após reboot. A configuração de produção deve usar `Caddyfile.automatic`, com ACME e estado no disco persistente, ou um carregador de certificados explicitamente revisado. Verificar a renovação e o reboot antes do aceite; preparar o host não comprova esse funcionamento.

Antes de habilitar qualquer consumidor: validar cópia/roles/migrations, restauração GCS/WAL, certificado, proxy/auth/sessão e domínio canônico; parar consumidores da origem na janela aprovada. A habilitação dos serviços/timers e o corte são etapas separadas. Uma cópia de teste ou `host-prepared.json` não comprova prontidão para produção.

## Testes locais

```text
python3 -B -m unittest discover -s deploy/google/vm/bin -p 'test_*.py' -v
```

Os testes usam somente dados fictícios e mocks. Não executam apt, Docker, systemd, formatação, APIs ou consultas SQL.
