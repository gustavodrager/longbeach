# Infraestrutura candidata da VM LongBeach

Este root Terraform tem estado próprio. Ele prepara uma VM nova e não declara Cloud SQL, Cloud Run, Firebase, DNS, recursos de outros clientes ou a infraestrutura atual. Não reutilize o prefixo de estado de `deploy/google/terraform`. O backend GCS deve ser inicializado com um prefixo novo e revisado.

O tamanho autorizado é `e2-medium`, São Paulo `southamerica-east1-a`, boot de 10 GiB e disco PostgreSQL separado de 20 GiB, ambos `pd-balanced`. O IP é regional reservado. A VM usa Debian 13 amd64 com versão de imagem explícita, Secure Boot, OS Login e SSH apenas pelo IAP. O módulo habilita a API IAP e concede à administradora já autorizada `parserotech@gmail.com` acesso IAP e OS Admin Login somente nesta VM, além de `serviceAccountUser` somente na identidade desta VM. Não cria novos administradores nem concede papéis de operação no projeto inteiro.

Na primeira aplicação, `public_ingress_enabled=false`. Não existe regra pública de 80/443 e não há regra de 5432/8080. Uma prova candidata requer `public_ingress_enabled=true`, `public_ingress_approved=true` e o CIDR IPv4 do navegador em `public_source_ranges`; a exposição universal exige uma aprovação de corte e um plano separado. A abertura do firewall não altera DNS ou os gates de execução da aplicação.

## Entradas do helper de publicação

- `boot_image`: nome/self-link exato `projects/debian-cloud/global/images/debian-13-trixie-v...`; resolver a versão somente por leitura antes da prévia.
- `api_image`: digest da publicação atual, congelado no módulo para esta migração.
- `postgres_backup_image` e `caddy_image`: imagens revisadas do PostgreSQL 18/pgBackRest no AR LongBeach e Caddy oficial, ambas por digest.
- `bootstrap_bundle`: `{bucket, object, generation, sha256}` de um `tar.gz` privado com `bin/bootstrap-vm` executável. O pacote contém código/configuração pública, nunca secrets, dumps ou chaves.
- `secret_refs`: cinco referências de runtime existentes, com versões numéricas. Terraform gerencia apenas IAM e referências; não acessa valores. Nenhuma credencial administrativa/migradora é concedida à VM.
- `public_environment`: configurações não secretas revisadas. Não aceita sobrepor os flags de startup, workers, hosts ou cookies.
- `backup_bucket_name` e `backup_prefix`: bucket novo, privado, exclusivo do LongBeach e prefixo `pgbackrest/longbeach/` por padrão.

O módulo cria somente os metadados do secret novo `longbeach-vm-postgres-admin-password`, protegido e com réplica São Paulo. O responsável publica uma senha nova fora do Terraform; `postgres_admin_secret_version` fixa a versão numérica (1 por padrão). A primeira preparação deve falhar fechada se a versão ainda não existir; após preenchê-la, reexecutar explicitamente o prepare com os mesmos hashes. Esse administrador do PostgreSQL local é separado do runtime e de todos os usuários/creds do Cloud SQL. Nenhum valor ou `secret_version` entra no estado Terraform.

O loader obtém token da conta da VM apenas em memória, baixa a geração GCS exata e verifica SHA-256. Recusa links, devices, paths fora do diretório ou modos privilegiados no tar. Grava o manifest público, com permissão `0600`, em `/etc/longbeach/bootstrap.json`, e chama:

```text
bundle/bin/bootstrap-vm --manifest /etc/longbeach/bootstrap.json --prepare-only
```

O schema 1 contém `project_id`, `api_image`, `postgres_backup_image`, `caddy_image`, `api_domain`, `web_origin`, `secret_refs`, `postgres_admin_secret`, `public_environment`, `data: {device, mount_path}`, `backup: {bucket, prefix}` e os três `gates` falsos: `database_restore_approved`, `runtime_enabled`, `workers_enabled`. O dispositivo é `/dev/disk/by-id/google-longbeach-postgres`, montado pelo helper em `/var/lib/longbeach`. O loader não formata/monta discos, não restaura dados, não aplica migrations e não inicia consumidores. O helper deve preservar essa fronteira e não tratar referências de secrets como valores de conexão já adaptados à VM. Uma preparação concluída deixa recibo com SHA do pacote/manifest; um reboot com as mesmas referências não reaplica prepare nem reseta o controle posterior de runtime. Uma preparação incompleta pode repetir somente um pacote extraído idêntico ao arquivo verificado.

O script usa `metadata["startup-script"]`, permitindo atualizar a metadata sem substituir a VM. Ao migrar uma instância criada com `metadata_startup_script`, primeiro mantenha o bundle e o texto renderizado exatamente iguais e revise um plano sem criação, remoção ou substituição da VM; só depois altere referências do bundle. A mudança da metadata não instala o pacote no host já preparado. Um pacote diferente exige atualização explícita dos arquivos e do recibo de preparação, preservando os bytes do recibo original e as verificações dos dois pacotes. Não apagar `prepared.json` nem repetir `prepare` sobre PostgreSQL ativo para contornar essa proteção.

O helper mantém PostgreSQL e API em rede interna dos contêineres; apenas Caddy publica 80/443 após aprovação. A API preserva `api.longbeach.quebranunca.com.br`, a web/Firebase preserva `longbeach.quebranunca.com.br` e os limites atuais de CORS/cookies. O manifest candidato começa com `TrustAllForwarders=false`; a configuração de runtime revisada do helper habilita a confiança para o Caddy, pois a imagem publicada não lê uma lista configurável de proxies. Isso depende de não publicar 8080/5432 e de o Caddy limpar os headers encaminhados; requer validação de login/renovação com a topologia final.

## Proteção e limites

O disco de dados e a VM têm `prevent_destroy`; a VM também tem deletion protection e o boot não é apagado automaticamente. O bucket usa acesso uniforme, prevenção de acesso público, `force_destroy=false` e `prevent_destroy`. Não há lifecycle por idade apagando WAL: o pgBackRest controla a expiração consistente do repositório. A retenção de soft delete é de sete dias e também consome armazenamento.

A conta da VM lê somente o repositório AR LongBeach, os cinco secrets existentes, o novo secret administrativo exclusivo desta VM e o objeto exato do pacote. Para backups tem `objectUser` no próprio bucket com objetos limitados ao prefixo; a listagem de metadados é autorizada no bucket exclusivo porque GCS avalia `objects.list` no bucket. Nenhuma chave de conta de serviço ou papel IAM de projeto é criado. O escopo OAuth `cloud-platform` continua limitado por esses bindings de IAM.

Este root não concede permissão de criar snapshots nem cria recursos de backup de outros clientes. A conta operacional humana poderá fazer snapshots revisados quando necessários. Não há HA ou failover automático; manutenção, restauração e testes de capacidade são responsabilidade operacional. O desligamento da VM não elimina as cobranças dos discos, IP estático associado e backups.

Antes de qualquer apply: confirmar APIs já habilitadas (Compute/IAM/AR/SM/Storage/IAP), orçamento, quota E2 e prefixo independente de estado; revisar plano completo e pacote por hash. Migração final e ativação exigem cópia validada, migrations por execução única e bloqueio dos consumidores da origem. Recursos atuais permanecem preservados durante a validação.

## Validação local

Com o provider Google 8.6.0 já instalado, executar `terraform init -backend=false`, `terraform fmt -check`, `terraform validate`, `terraform test` e `python3 -m unittest discover -s tests -p 'test_startup.py'`. Os testes usam provider/metadados/GCS simulados; não consultam nem modificam a nuvem. Este diretório não contém credenciais ou arquivos reais de variáveis de produção.
