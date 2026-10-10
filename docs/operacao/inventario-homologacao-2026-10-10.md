# Inventário e proposta de homologação — 10/10/2026

## Decisão vigente

O usuário decidiu manter a homologação **localmente**. A proposta hospedada abaixo fica apenas como histórico: não criar serviços no Railway, domínios, DNS, deploys ou custos adicionais. Os modelos `deploy/homologacao/*.env.example` foram adaptados para localhost e substituem os modelos hospedados descritos anteriormente. Seguir `homologacao-local.md`.

## Resultado da consulta

Consulta autenticada e somente de leitura no Railway, conexão QuebraNunca, projeto **longbeach-os** (`b88a93d7-6964-4ac5-9590-7cef49598cf0`). Os valores de credenciais não foram lidos nem exportados.

| Componente | Evidência atual | Conclusão |
| --- | --- | --- |
| Railway staging | Ambiente `0c988eb2-1c63-4910-bbd1-0d4baf266188`: zero serviços, volumes, buckets, variáveis compartilhadas e mudanças pendentes. | Existe apenas o ambiente vazio. |
| Railway test | Ambiente `70b09c7b-2f67-4386-9469-94cb7cc38d0d`: mesmos recursos ausentes. | Vazio; não é o banco local usado nos testes. |
| Railway development | Ambiente `a90e232c-4857-4f06-bbba-0c3246df5c89`: mesmos recursos ausentes. | Vazio. |
| Google em production | API possui nomes de variáveis `Enabled`, `ClientId`, `AllowedEmail`, `ProvisionAllowedEmailsAsOwners`; web possui `VITE_GOOGLE_CLIENT_ID`. | Há configuração cadastrada para produção. Valores, validade, projeto Google e origens autorizadas não foram inspecionados. Isso não comprova cliente Google de homologação. |
| PagBank em production | API lista variáveis EDI, mas não variáveis `Payments__PagBank__*`, `Payments__Billing__*` ou `Payments__PagBankSubscriptions__*`. | EDI é integração distinta. Não comprova configuração de checkout ou recorrência. |
| Credenciais locais | Nenhum `.env.pagbank.local` nas duas cópias conhecidas; workspace atual contém exemplos, não configurações preenchidas dessas integrações. | Nenhuma credencial sandbox recuperada nesses locais. Não foi feita busca indiscriminada no computador. |
| Histórico PagBank | Runbook registra ensaio sandbox e envio de formulário em 07–08/10. | Alguma configuração existiu, mas sua localização atual e aceite externo seguem sem confirmação. Não afirmar que nunca existiu conta sandbox. |
| Prévia local | Continua conectada à API/banco fictícios; integrações externas desativadas. | Disponível para revisão da implementação. |

Não foram criados serviços, alteradas variáveis, expostos domínios, enviados commits ou executados deploys nesta investigação.

## Proposta hospedada anterior — não aprovada e substituída

Aproveitar **staging** existente no projeto Long Beach; criar três instâncias nesse ambiente:

| Serviço | Preparação proposta |
| --- | --- |
| PostgreSQL 17 | Banco e volume próprios, credencial nova gerenciada no ambiente; rede privada, sem proxy TCP público. Nenhuma cópia de dados de produção. |
| API .NET | `deploy/api.Dockerfile`, uma réplica inicial. Ambiente Staging; chave JWT nova e issuer/audience próprios. Health check `/health/ready`; migration em job/pre-deploy único `dotnet LongBeach.Api.dll --migrate-only`. Provisionamento de contas fictícias será executado de forma explícita, preservando auditoria. |
| Web | `deploy/web.Dockerfile`, uma réplica inicial. Build apontado somente à API staging; health check `/healthz`. Mesma revisão identificada da API. |

Endereços propostos, ainda não criados: `https://longbeach-hml.quebranunca.com.br` e `https://api.longbeach-hml.quebranunca.com.br`. Cookie anti-CSRF restrito a `longbeach-hml.quebranunca.com.br`, separado do domínio de cookie da produção. Ajustar DNS/TLS somente após aprovação. Não registrar domínio novo.

Modelos revisáveis estão em `deploy/homologacao/api.env.example` e `deploy/homologacao/web.env.example`. Campos de banco, JWT e provedores ficam vazios de propósito. Esses arquivos não iniciam nem configuram nenhum serviço por si próprios. Flags de pagamentos, cadastro Google e bootstrap permanecem desligadas até a etapa correspondente.

Usar a cópia local `codex/perfis-acesso` como candidata, com diff revisado e commit identificado antes da publicação. Não apontar staging para atualização automática de uma branch de produção. O envio dessa candidata ao repositório também depende da aprovação já combinada. A validação anterior aprovou 705 testes e o fluxo de caixa local; não houve mudança de código de aplicação nesta investigação.

Provisionar PostgreSQL, API e web adiciona consumo à conta Railway. O valor não foi estimado nesta rodada: depende do plano e do uso. Não foi feita contratação ou geração de custo por novos serviços.

## Google e PagBank

**Google:** localizar o projeto que administra o Client ID já usado em produção e conferir seus clientes existentes antes de criar outro. Propor cliente Web separado para homologação, autorizando apenas a origem aprovada e, se necessário, localhost para testes locais. O [guia oficial Google](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) exige Client ID Web e origens JavaScript correspondentes. Não alterar o cliente de produção para conseguir testar.

**PagBank:** localizar a conta sandbox usada no ensaio registrado. Reaproveitar a conta de testes somente após confirmar que é a conta própria do Long Beach; configurar credenciais sandbox de Pedidos e, separadamente, Recorrência. [Sandbox e Produção são ambientes distintos](https://developer.pagbank.com.br/docs/ambientes-disponiveis). As pendências do ensaio anterior — repetição Pix, estorno de cartão, assinatura de notificação e recorrência — continuam no roteiro `proxima-rodada-google-pagbank.md`.

Nenhum portal administrativo Google/PagBank foi inspecionado nesta rodada; não há evidência suficiente para afirmar ausência de contas nesses provedores. A confirmação requer acesso do responsável aos respectivos painéis, sem enviar segredos pela conversa.

## Escopo histórico da proposta hospedada

Aprovar separadamente o provisionamento da infraestrutura staging e os domínios propostos, com possível consumo adicional, além do envio/publicação da candidata apenas nesse ambiente. A aprovação não inclui produção, dados reais, cobranças reais, mudança no Google de produção, abertura de acesso administrativo a terceiros ou habilitação EDI.

Após a infraestrutura: conferir isolamento, migrations, saúde, conta fictícia e sessões; configurar Google/PagBank sandbox nos painéis autorizados; executar os cenários externos e registrar resultados antes de considerar produção.
