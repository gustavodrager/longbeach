# Homologação PagBank no Google Cloud

A homologação hospedada foi autorizada em 25/10/2026, com dados exclusivamente fictícios no projeto `parsero-staging-20261022`, separado de produção. O aplicativo permanece na revisão indicada em `deploy/google/source-revisions.json`; os controles abaixo não exigem alterar seu artefato. Esta publicação não significa aprovação dos testes externos de pagamento pela PagBank.

## Fronteiras

| Recurso | Homologação |
| --- | --- |
| Região / instância existente | `southamerica-east1` / `parsero-staging-postgres` |
| Banco exclusivo novo | `longbeach_pagbank_homolog` |
| Banco dos ensaios anteriores, preservado | `longbeach` |
| Web | `https://longbeach-homolog.quebranunca.com.br` |
| API | `https://api.longbeach-homolog.quebranunca.com.br` |
| Domínio do cookie CSRF | `longbeach-homolog.quebranunca.com.br` |
| Estado Terraform | bucket `parsero-staging-20261022-tfstate-01`, prefixo `longbeach/staging` |

O domínio é irmão do domínio de produção, `longbeach.quebranunca.com.br`: seus cookies não se sobrepõem. CORS aceita somente a origem canônica da web de homologação; o endereço Firebase `.web.app` serve para conferir o artefato estático, não para usar a sessão. Não adicionar rewrite de API ao Firebase nem ampliar o domínio do cookie para `quebranunca.com.br`.

Os usuários SQL são `longbeach_pagbank_homolog_runtime` e `longbeach_pagbank_homolog_migrator`, novos e sem vínculo com os usuários de produção ou dos ensaios anteriores. O runtime pode executar DML no banco novo, sem DDL nem conexão a outros bancos; o migrador é proprietário somente desse banco e do seu schema. Não conceder `cloudsqlsuperuser` ou outros papéis. O provisionador deve recusar acesso herdado por `PUBLIC CONNECT` e preservar ACL/proprietário/conteúdo do banco anterior.

Os quatro novos recipientes Secret Manager, sempre com versões numéricas, são `longbeach-homologation-db-runtime-connection`, `longbeach-homologation-db-migration-connection`, `longbeach-homologation-jwt-signing-key` e `longbeach-homologation-reviewer-password`. As duas senhas SQL e a chave JWT são novas. A API recebe apenas conexão runtime e JWT. A senha fictícia de avaliação fica disponível somente para a identidade temporária de preparação; não é variável da API, anexo de logs ou conteúdo do Git.

## Fases revisadas

Todas as opções novas de `pagbank_homolog.tf` começam em `false`. Produção mantém suas referências, flags e dimensionamento anteriores. Manter `enable_pagbank_homolog=true` em todo plano futuro desse estado staging para preservar os recursos já criados; não executar um plano antigo que esqueça essa opção.

| Fase | Opções principais | Resultado |
| --- | --- | --- |
| Fundação | `enable_pagbank_homolog=true`, `homologation_credentials_ready=false` | Cria somente o banco exclusivo e quatro recipientes, preservando o job e seus segredos anteriores. |
| TLS/DNS antecipados | anterior + `enable_homologation_endpoints=true`, hosts novos e `create_web_custom_domain=true` | Cria IP, autorização DNS, certificado/mapa/entrada, política TLS e domínio Firebase; não cria API, NEG, backend, regras de encaminhamento ou invocação pública. |
| Credenciais e migração | anterior + `homologation_credentials_ready=true`, imagem staging imutável | Troca somente os consumidores staging para os segredos próprios já provisionados; atualiza o job `longbeach-migrate`, sem executá-lo. |
| Preparação fictícia | anterior + `enable_homologation_prepare_job=true` | Cria job/identidade temporários para `--prepare-pagbank-homologation`, uma tarefa sem retries; não o executa. |
| API privada | preparação desabilitada + `enable_api_service=true`, `public_api_enabled=false` | Cria API e balanceador protegidos por IAM, com workers desligados, ingress pelo balanceador e dados fictícios. |
| Acesso externo | `homologation_ready_for_public=true`, `cutover_gate_confirmed=true`, `public_api_enabled=true` após validação | Permite invocar o serviço staging pelo balanceador, conservando o login do aplicativo. |

A fundação foi aplicada em 25/10/2026 às 14:42 UTC, com seis criações (banco, quatro recipientes e guard), sem alterações em recursos existentes. As outras fases precisam de seus planos, execuções e evidências próprias; sua existência no código não comprova execução.

Os registros DNS de autorização e propriedade podem ser publicados em paralelo à preparação SQL após a fase de endpoints. Usar os outputs `api_ip_address`, `api_certificate_dns_authorization` e `web_required_dns_updates`; publicar somente os novos registros aprovados, preservando a zona de produção. Certificado ativo não comprova conteúdo ou login. A fase de endpoints não aceita requisições de API: NEG/backend/proxies/forwarding rules só surgem com a API privada.

Antes de ativar `homologation_credentials_ready`, provisionar privadamente os quatro valores novos e conferir suas versões. Atualizar referências para versões inexistentes faz o Cloud Run recusar o job/serviço. Nunca copiar dados ou credenciais de produção. A API continua ausente durante o provisionamento SQL. Não confundir criação ou atualização de job com sua execução.

Executar `longbeach-migrate` uma vez, sob operador único, conferindo projeto, imagem e banco exclusivo. A aplicação usa `--migrate-only`, usuário migrador, uma tarefa e retries zero. Confirmar as migrations esperadas pelo artefato, runtime sem DDL e isolamento entre bancos. O banco `longbeach` dos ensaios anteriores não é alvo desse job após a troca das referências; não o migrar por inferência.

Somente então executar separadamente `longbeach-prepare-homolog`, com `--prepare-pagbank-homologation`, usando `longbeach-homolog-prepare`. Essa identidade recebe conexão runtime, JWT e senha de avaliação, sem credencial migradora. O comando cria usuários e catálogo fictícios suportados pelo aplicativo, sem cópia de produção. Após sucesso, remover o job/identidade/permissões temporários por novo plano com sua opção desabilitada. A senha nunca precisa entrar na API.

Antes de liberar acesso externo, confirmar TLS, versão API/web, health privado, `/api/v1/auth/options` oferecendo login fictício sem Google, login/refresh/logout/CSRF no domínio próprio e HTTP 401 sem sessão nos endpoints protegidos. Verificar Bar/Quadra/recebimentos e permissões usando apenas dados fictícios. Não enviar senhas no pacote de logs; a entrega do acesso de teste usa canal autorizado separado.

## Controles e consumo

Com as credenciais exclusivas prontas, o módulo força `Homologation__Enabled=true`, Google desabilitado, Order/PIX/cartão PagBank e recorrência desabilitados, URLs Sandbox explícitas, EDI e C6 desabilitados e `DemoMode__PublicOperationalData=false`. Também mantém desabilitados workers, migrations/seeds no startup, bootstrap de proprietário e provisionamento automático Google. Não há relaxamento da assinatura de notificações.

O CRUD interno de despesas pode funcionar com registros fictícios; nenhuma transferência financeira externa é habilitada por esta publicação. Retomar testes de cobrança, estorno e recorrência exige etapa própria com credenciais Sandbox, autorização e tratamento das pendências do chamado PagBank.

A API de homologação permite zero instâncias ociosas e CPU somente durante requisições, com limite de uma instância de 1 CPU/2 GiB. Esse ajuste vale somente para a homologação isolada sem workers; produção conserva sua configuração. O primeiro acesso pode iniciar uma instância fria. A instância SQL existente, o IP reservado e o balanceador continuam sendo recursos de infraestrutura a acompanhar; zero instâncias ociosas não significa custo total zero. Não criar nova instância SQL para o banco fictício.

Não destruir bancos como rollback. Preservar o banco anterior e o novo, segredos e recibos privados; interromper a liberação ou manter a API privada enquanto um teste falhar. Qualquer apply parcial exige conferir o estado e gerar novo plano antes de outra tentativa. Conferir o [runbook Google](google-cloud.md) e o ADR-014 para as regras gerais.
