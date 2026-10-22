# Infraestrutura Google Cloud da Parsero

## Estado real em 22/10/2026

Projetos `parsero-prod-20261022` (produção) e `parsero-staging-20261022` (staging) criados; a conta administrativa escolhida está autenticada no SDK. O faturamento brasileiro em BRL está aberto (`open=true`) e habilitado nos dois projetos. O orçamento mensal de R$ 1.500 foi criado, com limiares de 50%, 80% e 100%, destinatários IAM padrão e créditos promocionais excluídos da base. Não é limite de cobrança; a entrega das notificações ainda deve ser acompanhada.

A infraestrutura base já tem APIs, Artifact Registry, contas de serviço e recipientes de segredos. As duas instâncias usam PostgreSQL 18, 1 CPU, 4 GiB e SSD inicial de 20 GiB em São Paulo e estão `RUNNABLE`: produção `REGIONAL` nas zonas `a`/`b` e staging `ZONAL`. Os estados remotos estão em buckets GCS privados separados, com versionamento e soft delete de 30 dias. Após aceite dos termos pelo responsável, Firebase de produção e staging estão `ACTIVE`, com seus sites padrão importados no Terraform.

Há imagem de API verificada nos registros dos dois ambientes, baseada na revisão `dfa90df`, e artefato web privado verificado da revisão `42e5ac8338a921ad7dcf96dfa6065e264712c601`, sem publicação. O backup real da origem de 22/10 às 19:18:05 UTC, com 1.235.242 bytes e SHA-256 `7b5d0ed790da4ab2d3353bf061bf6cf2ce846f2e8a1816e2570660a6b05a90b5`, foi restaurado na base isolada de produção do Google: 59 tabelas, 12.008 linhas e 26 migrations, com conteúdo e sequências idênticos à cópia verificada. O runtime SQL executa apenas DML; DDL e conexão aos bancos administrativos foram negados nos testes. O bucket privado temporário de migração em São Paulo tem ciclo de vida de 14 dias e soft delete de sete dias; é separado do estado Terraform.

Os jobs de migrations concluíram com `SUCCESS`: produção `longbeach-migrate-wzw9l` e staging `longbeach-migrate-5fbnm`. Os quatro segredos de base/administração e três segredos adicionais de produção estão no Secret Manager em versões numéricas `1`; a chave JWT foi preservada e as credenciais EDI foram conferidas, sem registrar valores. A API de produção foi criada como candidata privada e está `Ready`; o balanceador HTTPS e a associação do domínio web foram criados. O certificado ainda aguarda o registro de autorização DNS, portanto o caminho completo continua em validação. Todos os gates de acesso público e workers permanecem `false`, sem publicação web nem troca de DNS. O Railway permanece como fonte oficial; a janela de corte e a cópia final seguem pendentes. O [runbook](../../../docs/operacao/google-cloud.md) registra as evidências e próximos passos. Não registrar IDs de faturamento, dados pessoais, caminhos de origem ou credenciais neste repositório.

O Console confirmou **Free Trial disponível em 100%, R$ 1.779,29**, de 22/10/2026 a 21/01/2027. São créditos de avaliação, não os US$ 2.000 do Google for Startups. A conta ainda exibe o banner de avaliação; não há confirmação de conversão para plano pago. Os custos exibidos estavam em zero e podem levar até 24 horas para consolidação, portanto não comprovam ausência de consumo.

Este root configura **um ambiente por estado** nos projetos já criados, depois de confirmar vínculo com faturamento ativo da Parsero. `project_ids.production` e `project_ids.staging` precisam ser diferentes. A conta administrativa, pagamento e termos são preparados no Console; este código não cadastra faturamento nem cria projetos. Não há chave de service account nem credencial em arquivos Terraform.

## Recursos e limites

- Região de processamento, dados e segredos: `southamerica-east1` (São Paulo).
- Production: Cloud SQL PostgreSQL **Enterprise General Purpose**, 1 vCPU, 4 GiB, SSD inicial de 20 GiB com crescimento automático, disponibilidade `REGIONAL`, zonas `a` e `b`, backups diários às 06:00 UTC, sete cópias e PITR de sete dias. Edition é explícita para impedir o default Enterprise Plus das versões recentes do PostgreSQL.
- Staging: outro projeto, estado, banco, identidades, segredos e site; Cloud SQL `ZONAL` para evitar o custo de um segundo standby. Os requisitos de cópia e recuperação continuam habilitados. Não aplique staging sem revisar o custo adicional.
- Apenas `longbeach` é criado inicialmente. As opções LavaMais e Danielli preparam somente bancos vazios; elas **não autorizam colocar os clientes em operação** antes de criar seus usuários, revogar privilégios públicos e testar o isolamento. Nenhum código, migration, autenticação ou credencial é compartilhado.
- Endereço público do Cloud SQL sem nenhuma rede autorizada. O acesso da aplicação usa o Cloud SQL Auth Proxy integrado ao Cloud Run, a identidade IAM `roles/cloudsql.client` e autenticação SQL própria. O trecho local é um Unix socket; o Proxy estabelece o túnel TLS autenticado até o servidor.
- Secret Manager com réplicas em São Paulo e acesso por segredo: runtime não lê a conexão de migrations. Valores e senhas SQL são cadastrados fora do Terraform. Não existe `secret_version.secret_data` nem senha no estado.
- Recipiente administrativo separado `parsero-postgres-admin-password`, protegido contra exclusão, sem versão/valor no Terraform e sem permissão para runtime ou migrador. Serve somente à administração/recuperação da instância; não é uma credencial da aplicação.
- Artifact Registry exclusivo do LongBeach por ambiente. Imagens são promovidas por digest SHA-256; tags são imutáveis.
- API Cloud Run com 1 CPU, 2 GiB, CPU contínua, mínimo/máximo de uma instância, sem execução automática de migrations. O limite de instância não substitui os controles de exclusão dos workers durante uma troca de revisão.
- Job de migrations separado, identidade e conexão próprias, uma tarefa, paralelismo um, sem retries automáticos; criar o job não o executa. O operador precisa garantir uma única execução em andamento.
- API preparada atrás de balanceador HTTPS e serverless NEG, TLS 1.2+, sem CDN. **O candidato continua privado por IAM**, mesmo com serviço e balanceador criados: `public_api_enabled=false` não concede invocação a `allUsers`. A restrição de ingresso também bloqueia acesso externo direto pelo host `run.app`.
- Certificado com autorização DNS para emitir TLS antes de mudar o endereço atual da API. O Terraform não altera DNS, não transfere domínios nem publica conteúdo no Firebase Hosting.
- Orçamento **opcional** de R$ 1.500, gerenciado somente no estado de produção, cobre a conta de faturamento inteira, com avisos em 50%, 80% e 100%. A base exclui créditos promocionais para avisar sobre o consumo real. Não é um teto de gastos.

O código não migra dados, executa jobs, desliga o Railway ou publica o módulo Financeiro. O acesso público exige `public_api_enabled=true` junto com `cutover_gate_confirmed=true`, depois de backup, validação e aprovação da janela de transferência. As rotinas automáticas têm controle independente e ficam desabilitadas até `workers_enabled=true` junto com `source_workers_disabled_confirmed=true`. Isso depende da imagem contendo o controle `BackgroundJobs__Enabled` desta alteração; não use uma imagem antiga que desconheça a opção. Homologação com dados sintéticos também exige a opção pública explícita e o aceite das verificações aplicáveis; não publique automaticamente uma cópia com dados reais.

## Preparação e estado

Use Terraform 1.11 ou superior (validação operacional com 1.14.9), credenciais de usuário/ADC e os provedores fixados no `.terraform.lock.hcl`. Os checksums oficiais assinados incluem macOS ARM64 e Linux AMD64; o CI usa diretório de provedores isolado e lock somente leitura. Não use `gcloud auth application-default login` com outra conta administrativa sem revisar a identidade ativa. O bucket do estado deve existir, ser privado, ter versionamento e acesso restrito aos administradores/deploy autorizados.

Para um projeto novo, a ordem de bootstrap é Service Usage e Cloud Resource Manager, confirmação de propagação, Storage para o bucket de estado, configuração do projeto de quota do ADC e, depois, inicialização/aplicação do Terraform. Os provedores Google usam `billing_project=local.project_id` e `user_project_override=true`, inclusive para o orçamento com ADC de usuário. Em erro de API recém-habilitada, preservar o estado e replanejar após conferir os recursos; não apagar recursos ou estado para repetir a criação. O aceite Firebase é realizado pelo responsável no Console. Se já houver projeto/site Firebase, importar o recurso correspondente em vez de criar uma duplicata.

Os buckets de estado usam controle de acesso uniforme, prevenção de acesso público, versionamento e soft delete de 30 dias. Não configurar retenção WORM, Object Lock ou hold padrão, pois o backend precisa atualizar o estado e remover o arquivo de lock. Runtime e migrador não recebem acesso ao estado; o futuro executor recebe somente as permissões necessárias no bucket de seu ambiente. O bucket temporário de backup de negócio é outro recurso e tem retenção própria.

Guarde o `.tfvars` preenchido e a configuração do backend fora do Git. Nunca reuse o mesmo prefixo GCS para os dois ambientes. Prefira diretórios de trabalho separados; ao reutilizar este diretório, faça `init -reconfigure` e confira o estado antes do plano.

```sh
terraform init -reconfigure \
  -backend-config="bucket=BUCKET_PRIVADO_DE_ESTADO" \
  -backend-config="prefix=longbeach/production"
terraform validate
terraform plan -var-file=/caminho/privado/production.tfvars -out=/caminho/privado/production.tfplan
```

O arquivo de plano e o estado também são privados. Revise a conta, o projeto selecionado, SQL, IAM, DNS e os custos antes de aplicar o plano revisado. A conta precisa de permissão para habilitar serviços, administrar os recursos envolvidos e, opcionalmente, gerir o orçamento da conta de faturamento. Nenhum papel `Owner` ou `Editor` é concedido pelo código.

`pg_version` é obrigatório. A origem Railway foi identificada como imagem PostgreSQL 18; confirme o servidor real antes da cópia final e mantenha `POSTGRES_18` para evitar juntar migração de hospedagem e atualização de versão.

## Ordem operacional

1. Preencha a cópia privada do exemplo do ambiente. Mantenha `api_image=""`, `enable_api_service=false`, `public_api_enabled=false`, `cutover_gate_confirmed=false`, workers e domínio personalizado desabilitados. Aplique apenas a infraestrutura revisada.
2. Defina com segurança a senha administrativa da instância nova e armazene-a somente em `parsero-postgres-admin-password`, por memória ou arquivo privado, sem valor em Terraform ou argumentos. O recipiente não comprova que a senha/versão já foi preenchida. Cadastre os usuários SQL separados (`longbeach_runtime` e `longbeach_migrator`), retire acesso público a bancos e ao schema e teste o isolamento com os scripts de `deploy/google`. O runtime recebe somente as operações de aplicação; o migrator é dono dos objetos e recebe DDL somente neste banco. Não conceda `cloudsqlsuperuser` aos usuários da aplicação nem acesso ao segredo administrativo.
3. Restaure e confira a cópia no destino isolado. Guarde conexões completas e chave JWT nos segredos indicados por `secret_ids`, usando arquivos privados e sem exibir valores. Preserve a chave JWT de produção na transferência controlada se a decisão for manter sessões; use outra chave em staging.
4. A conexão Npgsql usa `Host=/cloudsql/PROJECT:southamerica-east1:INSTANCE;Database=longbeach;Username=longbeach_runtime;Password=...;SSL Mode=Disable;Maximum Pool Size=40`. Para migrations, use o usuário `longbeach_migrator`. `SSL Mode=Disable` aplica-se apenas ao socket local; o transporte do Proxy continua criptografado. Construa a string com escape apropriado para a senha, nunca concatenando caracteres sem tratamento.
5. Reconcilie configurações não sigilosas e referências de segredos com a produção atual. Inclua integrações ativas, OAuth, issuer/audience e chaves de webhook; o exemplo não copia configurações reais. Não habilite seed, bootstrap, provisionamento Owner ou migrations no startup.
6. Publique a imagem validada no Artifact Registry, registre o digest em `api_image` e mantenha `enable_api_service=false`. Aplique para preparar o job `longbeach-migrate`, identificado também pelo output `migration_job_name`. Execute o job uma única vez, confira sua conclusão e reconcilie as migrations; um único task count não impede dois operadores de iniciarem duas execuções.
7. Informe `api_domain`, `web_origin` e `csrf_cookie_domain`; este último deve ser o host da web, com a API abaixo dele. Habilite `enable_api_service`, mantendo `public_api_enabled=false` e workers desligados. Aplique, prepare a autorização DNS do certificado e espere TLS ativo. O operador autorizado valida o candidato com um Google identity token para a audiência `api_service_uri` no cabeçalho `X-Serverless-Authorization`; o cabeçalho `Authorization` continua disponível para o JWT da aplicação. Não imprima ou registre tokens. O frontend comum ainda não acessa essa API sem a camada IAM; conclua os testes privados e sintéticos sem abrir a cópia real ao público.
8. Publique o frontend validado no site Firebase indicado pelo output, configure a associação de domínio separadamente e teste sessão, refresh, CSRF/CORS, agenda, caixa, pagamentos e restauração. Preparar domínio gera instruções DNS, não muda o domínio oficial.
9. Só após aceite e janela combinada, bloqueie novas escritas e workers na origem, copie/concilie os dados finais e confirme a validação do destino. Habilite o acesso público com `public_api_enabled=true` e `cutover_gate_confirmed=true` dentro da janela aprovada; preserve a autenticação da aplicação. Mude DNS e habilite os workers do destino com seu gate independente confirmado. Preserve a origem e as transações necessárias para retorno.

Para adicionar uma credencial de integração, `extra_runtime_secrets` associa o nome da variável a um `secret_suffix` e versão numérica. Por exemplo, um suffix `pagbank-token` cria o contêiner `longbeach-pagbank-token`; nenhum valor é colocado no `.tfvars`. Todas as referências de segredos ficam presas a versões numéricas; uma rotação exige atualizar a referência e promover nova revisão. Os nomes aceitam somente letras, números e `_`, começando por letra ou `_`. A validação compara nomes sem distinguir maiúsculas/minúsculas, como o .NET, e bloqueia duplicatas, colisões entre configuração e segredo e substituição dos controles de segurança.

## Validação sem nuvem

```sh
terraform init -backend=false -input=false
terraform fmt -check -recursive
terraform validate
terraform test
```

Os 28 testes com provedores simulados e planos passaram sem criar recursos. Cobrem redundância de produção, recuperação, bloqueio de redes públicas, proteção contra exclusão, isolamento de projetos, ausência de deploy inicial, job independente, CPU contínua, workers desligados, bloqueio de acesso ao segredo administrativo e rejeição de configurações inseguras. Separadamente, passaram 47 verificações em 31 requisições de sessão, permissões, agenda e caixa usando a imagem OCI local conectada ao Cloud SQL de staging. Esse ensaio não é validação do Cloud Run nem E2E de navegador. Ainda faltam TLS/DNS no Registro.br, fluxo no Cloud Run e navegador, pagamentos, carga, failover e restauração de backups gerenciados/PITR do Google em destino isolado. A restauração da cópia Railway e o isolamento SQL descritos acima não substituem essas conferências.

Referências: [Cloud SQL HA](https://docs.cloud.google.com/sql/docs/postgres/high-availability), [conexão Cloud Run/Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/connect-run), [ingresso Cloud Run](https://docs.cloud.google.com/run/docs/securing/ingress), [DNS para certificados](https://docs.cloud.google.com/certificate-manager/docs/deploy-google-managed-dns-auth), [Firebase e Terraform](https://firebase.google.com/docs/projects/terraform/get-started).
