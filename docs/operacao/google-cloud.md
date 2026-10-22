# Migração do LongBeach para Google Cloud

## Estado e fronteiras

Estado conferido em 22/10/2026: a conta `parserotech@gmail.com` está autenticada no SDK e criou os projetos `parsero-prod-20261022` (Parsero Producao) e `parsero-staging-20261022` (Parsero Homologacao). O projeto padrão anterior foi preservado. A conta de faturamento foi cadastrada em Brasil/BRL, mas a última leitura da API e do Console a mostra fechada (`open=false`), com reabertura indisponível e `billingEnabled=false` nos dois projetos. O Console informa pré-pagamento para ativar o teste e prazo de até 24 horas para creditar. O responsável informou que fez o pagamento; aguardar confirmação do Google, sem afirmar falta de pagamento ou ativação concluída. Ainda não há confirmação de provisionamento pago, backup, publicação ou troca de DNS. Não tentar aplicar recursos pagos até confirmar faturamento aberto e habilitado nos projetos.

O orçamento de R$ 1.500 ainda está pendente: a tentativa de criação retornou `INVALID_ARGUMENT`, embora a API de orçamentos tenha sido habilitada no projeto de produção, e o botão de criação está indisponível no Console. Não declarar orçamento ou notificações funcionando antes de conferir o recurso criado. A janela de corte operacional também permanece pendente; combiná-la após a homologação do destino.

As referências verificadas são distintas: API `4c6a7a0afd46ee8f5f8ecf6f3a186465a608a723` e web `42e5ac8338a921ad7dcf96dfa6065e264712c601`, conforme `deploy/google/source-revisions.json`. O deployment web de referência é `d5daa648-bb3b-4055-8225-f3ffd553a9bc`, concluído em 20/10/2026 às 17:03 UTC. A branch de migração parte da API; seu `app/dist` local não é artefato comprovado do frontend de produção. Revalidar essas referências antes da promoção; alteração de versão exige revisar o manifesto e reconstruir, sem aproveitar um dist antigo. A release de despesas/reembolsos fica para outra promoção, após estabilizar a migração.

Conta administrativa: `parserotech@gmail.com`. Faturamento no CPF do Gustavo, país Brasil, moeda BRL. O responsável preenche documentos, endereço, cartão, autenticação e termos diretamente no Google. Não copiar esses dados, senhas, tokens, dumps ou certificados para Git, logs ou chat. Usar conta individual e segundo fator; a aplicação recebe contas de serviço próprias, nunca a credencial humana.

Começar pelo LongBeach; LavaMais e Danielli ficam desabilitados. Não migrar, desligar ou apagar outros clientes ou o sistema legado junto deste corte. [Decisão de arquitetura](../adr/ADR-014-google-cloud-e-isolamento-por-cliente.md).

## Validação desta preparação

Em 22/10/2026 passaram 423 testes unitários, 344 testes de integração da API com PostgreSQL 18 sintético, 440 testes do frontend publicado, 18 cenários Terraform com provedores simulados e 22 testes dos scripts de implantação. API, frontend/PWA e definições Terraform foram compilados/validados. O comando de migrations foi aplicado e repetido na base descartável com jobs desativados, sem criar usuários.

O ensaio local de backup/restauração comparou todas as tabelas públicas, contagens e hashes de conteúdo com sucesso em PostgreSQL 18 descartável, sem rede. Isso não comprova backup de produção, recuperação no Google, desempenho de 4 GiB ou failover: essas conferências dependem da liberação do faturamento e do destino real.

## 1. Conta, projetos e orçamento

Instalar SDK oficial Google Cloud, Terraform, Firebase CLI e clientes PostgreSQL do mesmo major da origem. Autenticar a conta escolhida pelo fluxo oficial, sem fornecer senha ao terminal. Conferir a conta antes de qualquer execução. Nenhum script abaixo instala ferramentas, escolhe outra conta ou roda comandos de nuvem por padrão.

Os projetos já criados correspondem a `GCP_PRODUCTION_PROJECT_ID=parsero-prod-20261022` e `GCP_STAGING_PROJECT_ID=parsero-staging-20261022`. Manter o ID de faturamento fora do repositório. Depois de confirmar `open=true`, conferir o vínculo de cada projeto e `billingEnabled=true`. O script `bash deploy/google/bootstrap-projects.sh` oferece prévia para revalidar/criar projetos e associar faturamento; repetir com `--apply` somente após revisar. O script não transfere projeto que já esteja ligado a outra conta de faturamento e não reabre uma conta fechada.

Inicializar estados Terraform separados por ambiente no backend GCS privado, com controle de acesso, versionamento e proteção contra exclusão. Não usar state local como estado definitivo nem armazená-lo no Git. O bucket de state deve existir antes de `terraform init`; ele pertence à administração da Parsero e não recebe backups de negócio. O README em `deploy/google/terraform` define os parâmetros de backend e entradas reais.

Habilitar o orçamento de **R$ 1.500/mês** na conta de faturamento após confirmar permissão, com alertas de consumo e projeção. É alerta, não limite de cobrança nem mecanismo para interromper aplicações. O orçamento acompanha os dois ambientes e demais recursos ligados à mesma conta. Conferir destinatário das notificações e moeda BRL. Não contratar desconto de permanência nesta preparação.

Primeira aplicação Terraform: `api_image` vazio. Cria somente recursos de base; não cria serviço API, job de migrations ou balanceador sem uma imagem fixada. Revisar o plano de cada ambiente e aplicar separadamente. Não aplicar um plano genérico de ambos os ambientes.

## 2. Banco, isolamento e secrets

Antes de escolher `pg_version`, conferir `SHOW server_version` na origem por sessão autorizada. Usar `POSTGRES_17` ou `POSTGRES_18` correspondente; esta mudança não inclui upgrade de major. O banco destino deve estar vazio. Ativar HA e backups/PITR de sete dias em produção; staging não recebe uma cópia de produção com dados pessoais para testes funcionais.

Executar `deploy/google/database-isolation.sql` como administrador no destino novo, por conexão administrativa autorizada. Ele exige o database vazio `longbeach` criado pelo Terraform e interrompe se os papéis já existirem. No SQL Studio do Google, selecionar `longbeach` e executar o conteúdo sem os metacomandos `\set` e `\connect`; o bloco transacional deve permanecer inteiro. O runtime é `longbeach_runtime`; migrations e restauração usam `longbeach_migrator`. Definir senhas únicas por `\password` em sessão psql privada, ou editar somente a senha dos papéis já criados por SQL na interface de usuários do Cloud SQL. Não criar esses usuários pela Admin API/gcloud: esse caminho pode acrescentar `cloudsqlsuperuser`. Não usar senha em argumento de comando, histórico, SQL versionado ou variável Terraform. Após definir as senhas, conferir em `pg_roles` que os papéis não são superusuários, não criam bancos/papéis e não têm bypass RLS; conferir em `pg_auth_members` que não receberam associações a outros papéis. Qualquer associação administrativa inesperada bloqueia a ativação do runtime.

Antes de habilitar outro cliente na instância, criar seus próprios papéis e database e revogar `CONNECT FROM PUBLIC` nele. Confirmar que o usuário runtime do LongBeach não conecta ao database desse cliente e vice-versa. Administradores da instância continuam tendo acesso administrativo; não distribuir suas credenciais às aplicações.

O bootstrap também remove conexão pública aos bancos administrativos `postgres` e `template1` na instância nova, conservando o acesso do administrador. Confirmar que o runtime só conecta a `longbeach`, executa CRUD das tabelas da aplicação, não cria tabelas e não acessa outro cliente. Senhas, grants ou proprietários existentes não são reaproveitados por inferência.

As APIs usam o conector Cloud SQL do Cloud Run e socket `/cloudsql/INSTANCE_CONNECTION_NAME`. As conexões têm `Host=/cloudsql/INSTANCE_CONNECTION_NAME;Database=longbeach;Username=...;Password=...;SSL Mode=Disable`; o túnel do conector autentica e cifra o transporte. A configuração usa IPv4 do Cloud SQL **sem redes autorizadas**, exigindo Cloud SQL Auth Proxy/conector e permissão IAM, além da autenticação PostgreSQL. Não é uma conexão PostgreSQL aberta a qualquer endereço da internet. Não adicionar `0.0.0.0/0` ou liberar porta direta para contornar a autenticação.

A administração pode usar SQL Studio ou Cloud SQL Auth Proxy autenticado com a conta autorizada e permissão mínima, inclusive a partir do notebook/Cloud Shell. Não é necessário provisionar VPC privada, bastion ou VPN para essa topologia. Fazer o proxy ouvir apenas em loopback; gravar credenciais PostgreSQL somente em arquivo privado ou informar pelo prompt seguro. IAM do proxy autoriza acesso à instância, mas não substitui os grants entre databases descritos acima.

Criar arquivos privados fora do repositório (`umask 077`, modo 0600), sem imprimir conteúdo, para:

- `longbeach-db-runtime-connection`, com o usuário runtime;
- `longbeach-db-migration-connection`, com o migrador;
- `longbeach-jwt-signing-key`, preservado da origem para manter identidades/sessões;
- demais integrações realmente ativas, cada uma exclusiva do ambiente.

Configurar `GCP_ENVIRONMENT` e `GCP_PROJECT_ID` correspondentes. `bash deploy/google/upload-secret.sh SECRET_ID ARQUIVO_PRIVADO` verifica o arquivo e mostra somente a operação. Com `--apply`, adiciona uma versão pelo arquivo, sem expor o valor nos argumentos. Anotar somente o número da versão e fixá-lo nas entradas Terraform; nunca usar `latest`. Conferir consumo no destino e remover a cópia temporária. O Terraform cria os recipientes e permissões, não recebe o conteúdo das credenciais. Certificados bancários, se ativos, requerem montagem segura específica antes do corte.

## 3. Artefato, ensaio e publicação técnica

Construir a imagem da revisão de migração, baseada na produção verificada, usando `deploy/api.Dockerfile`; publicar no Artifact Registry do ambiente e obter o digest `southamerica-east1-docker.pkg.dev/PROJECT/longbeach/api@sha256:...`. Cada ambiente tem seu repositório e imagem. Não usar tag mutável na configuração. Builds e CI precisam passar antes da promoção.

Atualizar `api_image` no Terraform, mantendo `enable_api_service=false`, fixar versões numéricas dos secrets e preservar as configurações não secretas inventariadas na origem (issuer/audience JWT, Google, CORS, flags das integrações). Isso prepara o job sem iniciar API ou balanceador antes de restaurar/migrar. O Terraform bloqueia startup migrations/seeds/Owner bootstrap e inicia `workers_enabled=false`. Não inferir flags ativas a partir de exemplos no repositório. Não copiar automaticamente configurações de produção para staging.

O job `longbeach-migrations` usa `dotnet LongBeach.Api.dll --migrate-only`, uma tarefa sem retries automáticos e o usuário migrador. Configurar `GCP_MIGRATION_JOB` e `API_IMAGE_DIGEST`; executar `bash deploy/google/run-migrations.sh` para prévia. `--apply` confere o digest exato, consulta as execuções do job e recusa iniciar se houver execução ativa ou conclusão não comprovada. Depois aguarda a execução única. Essa consulta não é um lock distribuído: um único operador deve controlar a promoção no environment; não iniciar migrations paralelas via CI ou outro terminal. O lock nativo EF/Npgsql complementa a proteção, sem substituir o congelamento da origem e destino durante a restauração. Seeds continuam desativados. No ensaio, usar banco sintético. No corte, a restauração vem antes de qualquer nova migration. Só após conferir o banco, mudar `enable_api_service=true` no plano revisado e iniciar a API ainda com `workers_enabled=false` e `public_api_enabled=false`.

O candidato exige autenticação IAM do Google antes de alcançar a aplicação. Nas conferências HTTP autorizadas, usar um token de identidade de uma conta com permissão de invocação no header `X-Serverless-Authorization`, conservando `Authorization` para o JWT próprio do LongBeach. Obter e transmitir o token em memória ou arquivo privado; não imprimir seu valor nem usá-lo em argumentos de processos/logs. O token de desenvolvedor emitido pelo SDK é limitado ao ensaio; chamadas de serviço usam token com a audience do serviço Cloud Run. O ingresso continua restrito ao balanceador; testar pelo host HTTPS dele. Acesso público, login de clientes e callbacks ficam desativados até a janela de corte. Essa proteção é IAM, sem Cloud Armor ou custo oculto dessa ferramenta.

Construir o frontend verificado pelo script abaixo. Ele usa `git archive` de `42e5ac8338a921ad7dcf96dfa6065e264712c601` em diretório temporário privado, instala o lockfile e não troca checkout nem usa arquivos modificados ou o dist da branch atual. Requer Node/pnpm compatíveis com o frontend validado. `VITE_API_URL` deve ser fornecida explicitamente; em produção só é aceita a origem canônica. O script força `VITE_DEMO_MODE=false` e `VITE_OPERATIONAL_STORAGE=postgres`. O client ID Google normalmente vem de `/api/v1/auth/options`; `VITE_GOOGLE_CLIENT_ID` é opcional e, quando fornecido, deve ser um valor público válido do ambiente. Para staging, usar sua API/identidade e seus domínios próprios.

```sh
export GCP_ENVIRONMENT=production
export GCP_PROJECT_ID=parsero-prod-20261022
export VITE_API_URL=https://api.longbeach.quebranunca.com.br
gcp_web_work_dir="$(mktemp -d "${TMPDIR:-/tmp}/longbeach-web-artifact.XXXXXX")"
export GCP_WEB_DIST_DIR="$gcp_web_work_dir/dist"
bash deploy/google/build-web.sh
# Após revisar a prévia, compilar localmente; isto não publica:
bash deploy/google/build-web.sh --apply
```

O output privado, novo e fora do repositório recebe `.longbeach-build.json` com commit, árvore Git do frontend, origem da API, ambiente, projeto, flags e hash dos arquivos. Não inclui credenciais ou client ID em texto. `deploy/google/deploy-web.sh` exige `GCP_WEB_DIST_DIR`, confere esses metadados e recalcula o hash antes de qualquer publicação; build de outra origem/ambiente/projeto ou arquivo alterado é recusado. `GCP_WEB_SOURCE_COMMIT`, quando informado, precisa coincidir com o manifesto revisado. Conservar as mesmas entradas usadas no build, inclusive client ID opcional se utilizado.

Definir `GCP_FIREBASE_SITE_ID` pelo output Terraform. `bash deploy/google/deploy-web.sh` oferece a prévia; `--apply` publica somente o artefato verificado no site existente, sem alterar DNS nem criar `.firebaserc` no repositório. `deploy/google/firebase.json` conserva SPA/PWA e headers de segurança, sem rewrite de API. A pasta `public` nele é deliberadamente inexistente: o script a substitui pelo artefato validado, impedindo publicação acidental de `app/dist`. A metadata oculta é excluída pelo ignore do Firebase.

A API fica atrás de global external Application Load Balancer, com certificado DNS autorizado antes do corte quando possível. Preparar os registros de validação emitidos pelo Terraform, verificar certificado ativo e registrar os valores anteriores. Não trocar registros A/CNAME de produção nesta preparação. O custo fixo adicional do balanceador é US$ 18,25/mês para 730h, mais processamento e tráfego; não confundir com uma opção gratuita de domínio. O IPv4 associado à regra não tem taxa adicional. Firebase só serve arquivos estáticos: proxyar a API por ele removeria `lb_refresh` e quebraria a renovação de sessão.

## 4. Backup, restauração e corte controlado

Combinar janela e responsável antes de parar gravações, conciliações ou DNS. Durante o ensaio e a conferência do destino com cópia real, manter os workers desligados e bloquear gravação de usuários no destino. Não fazer operações bancárias, vendas ou pagamentos fictícios em produção. A origem continua sendo a fonte oficial até o corte.

Usar conexão PostgreSQL autorizada por arquivos privados `PGSERVICEFILE`/`PGPASSFILE` ou canal equivalente, sem URL com senha em argumentos. O diretório dos arquivos e do backup deve ficar fora do repositório, com acesso restrito. Exemplo de procedimento no executor autorizado, conectado por proxy autenticado ou pelo canal aprovado da origem:

```sh
umask 077
pg_dump --dbname=service=longbeach-source --format=custom --no-owner --no-privileges --file="$BACKUP_FILE"
pg_restore --list "$BACKUP_FILE" > "$BACKUP_FILE.list"
pg_restore --file=/dev/null "$BACKUP_FILE"
shasum -a 256 "$BACKUP_FILE"
```

`BACKUP_FILE` é caminho absoluto privado definido pelo operador. A listagem/decodificação confirma que o arquivo é legível, mas só a restauração isolada valida recuperação. Registrar tamanho, hash, horário e versão das ferramentas sem registrar conteúdo. A autorização anterior de backup no Railway restringia a cópia ao servidor: antes de transferi-la ao Google para esta migração, registrar explicitamente que a nova migração inclui esse destino e usar bucket privado temporário, acesso mínimo e expiração. Não presumir que um dump já exista.

Restaurar como `longbeach_migrator` no database vazio, sem donos/grants da origem: `pg_restore --dbname=service=longbeach-target --no-owner --no-privileges --exit-on-error --single-transaction "$BACKUP_FILE"`. Não usar `--clean` em um banco com operação. Objetos restaurados devem pertencer ao migrador; aplicar os grants pós-restauração indicados ao final de `database-isolation.sql`. Se alguma extensão exigir administrador, provisioná-la explicitamente após inspeção do dump; não conceder superusuário ao runtime.

Ensaiar restauração em destino isolado sem processar integrações. Conferir schema, migrations aplicadas, contagens (`deploy/google/verify-row-counts.sql`) e totais operacionais/financeiros relevantes, identidades, auditorias e arquivos. Conferir login, refresh/logout, autorização negada, CORS, cookies, Bar, estoque, agenda e telas de leitura. Testar HA/reconexão e recuperar um ponto do backup com dados sintéticos. Definir RTO observado e registrar limitações; HA não elimina pausas nem substitui backup.

Na janela: bloquear novas gravações e encerrar workers na origem; confirmar ausência de operações em andamento; produzir backup/cópia final e comparar contagens/totais com a origem congelada. Não levantar os dois lados com workers ativos. Restaurar o destino definitivo, executar migrations controladas necessárias e confirmar saúde e identidade. Habilitar `public_api_enabled=true` e `cutover_gate_confirmed=true` somente pelo plano revisado do corte, para que clientes e callbacks alcancem a aplicação com sua autenticação existente. Confirmar que endpoints protegidos seguem negando acesso sem sessão, e trocar DNS somente com TLS pronto e acesso ao retorno. Preservar domínios, client ID Google, caminhos dos webhooks e flags de integração.

Depois da conferência e com a origem parada, ativar `source_workers_disabled_confirmed=true` e `workers_enabled=true` no Terraform de produção e promover somente o plano revisado. Conferir execução de conciliações e ausência de duplicação. Liberar as gravações no destino e marcar o Google como fonte oficial. Monitorar erros, latência, memória/CPU/conexões do banco, armazenamento, último backup e alertas; ajustar capacidade pelos dados observados.

## 5. Retorno e conclusão

Antes de gravar no destino, é possível retornar tráfego à origem preservada. Depois de qualquer nova gravação no Google, manter a fonte única e preferir correção da aplicação; voltar DNS sem reconciliar a base antiga perderia operações. Registrar corte, digest, migrações, estado dos workers, backup e responsável. Não executar migrations reversas destrutivas nem restaurar sobre a operação corrente como retorno rotineiro.

Manter Railway e cópias protegidas durante a janela acordada; retirar apenas após aceite e verificação de recuperação/backup no Google. A release financeira/reembolso de R$ 918,42 é promoção separada e não deve duplicar compra ou entrada em estoque já existente. Remover acessos temporários e arquivos privados conforme retenção, sem apagar evidências necessárias. Atualizar ADRs, manifesto de release e runbooks com fatos efetivamente verificados.

Referências oficiais: [domínios Cloud Run](https://docs.cloud.google.com/run/docs/mapping-custom-domains), [cookies Firebase](https://firebase.google.com/docs/hosting/manage-cache#using_cookies), [teste privado de desenvolvedores](https://docs.cloud.google.com/run/docs/authenticating/developers), [headers IAM e autenticação da aplicação](https://docs.cloud.google.com/run/docs/authenticating/service-to-service), [preços do balanceador](https://cloud.google.com/load-balancing/pricing), [preços IPv4](https://cloud.google.com/vpc/network-pricing#ipaddress), [backup PostgreSQL](https://www.postgresql.org/docs/current/app-pgdump.html), [restauração PostgreSQL](https://www.postgresql.org/docs/current/app-pgrestore.html).
