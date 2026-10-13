# Homologação PagBank no Railway

Autorizada pelo responsável em 13/10/2026, após revogar a limitação anterior a localhost. Projeto `longbeach-os`, ambiente `staging` (`0c988eb2-1c63-4910-bbd1-0d4baf266188`). Não copiar a base local, pois contém identidades reais, nem dados ou segredos de produção.

## Recursos e acesso

- Web: `web-homolog`, endereço `https://web-homolog-staging.up.railway.app`.
- API: `api-homolog`, somente rede privada, porta 8080.
- PostgreSQL 18: `Postgres-pbZb`, base nova `longbeach_pagbank_homolog`, volume próprio e sem proxy TCP público.
- Web encaminha `/api/` à API privada, preservando login, cookie HttpOnly e proteção CSRF no mesmo domínio. O serviço web usa Dockerfile e nginx específicos desta homologação.
- Credenciais de sessão e senha de avaliação geradas exclusivamente para este ambiente. Segredo Sandbox de Pedidos já validado, sem uso do token de produção. Nunca registrar esses valores neste documento.
- Acesso individual do avaliador: `avaliador@homolog.longbeach.invalid`. Senha entregue separadamente pelo responsável. Conta fictícia Administrator, sem vínculo Google ou pessoas reais.

## Inicialização e segurança

Executar `dotnet LongBeach.Api.dll --migrate-only` no pré-deploy controlado e depois `dotnet LongBeach.Api.dll --prepare-pagbank-homologation`. O segundo comando exige Staging, flag Homologation, nome exato da base exclusiva e endpoint Sandbox. Não inicia servidor, não reseta credenciais existentes, usa transação/bloqueio e recusa base com usuários alheios. O catálogo de permissões e a conta são gravados pela persistência auditada normal.

Migrations e seed automáticos em réplicas permanecem desligados. O acesso por senha é apresentado somente quando a API confirma Staging + Homologation. Produção mantém a tela Google. Endpoints protegidos continuam exigindo autenticação e permissões.

Pix e cartão usam exclusivamente `https://sandbox.api.pagseguro.com/`. Callback: `https://web-homolog-staging.up.railway.app/api/v1/integrations/pagbank/webhook`. EDI de produção e demonstração pública estão desativados. Recorrência só pode ser habilitada com credencial configurada e endpoint exato `https://sandbox.api.assinaturas.pagseguro.com/`; qualquer outro endpoint impede a inicialização da homologação.

## Critério de entrega

Publicar por commit fixado, testar login, recarga de sessão, consultas protegidas e configuração Sandbox pela URL pública. Criar apenas catálogo e operações fictícias. Registrar evidência de notificações assinadas separadamente de testes de disponibilidade: URL acessível não equivale a homologação aprovada.

O PagBank exige avaliação dos requests/responses: https://developer.pagbank.com.br/docs/solicitar-homologacao. Não enviar automaticamente o formulário, credenciais ou mensagens ao suporte. Recorrência usa configuração separada de credencial e endpoint, validada com consultas autenticadas no Sandbox. Integração administrativa PagVendas depende de contrato oficial ainda não confirmado.

Após o aceite, revogar a conta de avaliação e retirar a exposição pública quando não for mais necessária. Preservar evidências sanitizadas. Não promover banco, credenciais ou conta de homologação a produção.

## Verificações de 13/10/2026

Revisão [PR #30](https://github.com/gustavodrager/longbeach/pull/30), branch `codex/homologacao-pagbank-20261013`, com deploys fixados por commit apenas em staging. Login, recarga de sessão e consultas protegidas verificados no Chrome. Catálogo sem sessão retorna 401. Produtos, estoque, usuários e operações são fictícios.

### Notificações

As notificações reais do Sandbox de Pedidos chegaram sem `x-payload-signature` e sem o header legado. Com `Homologation__AllowUnsignedNotificationHints=true`, exclusivamente Staging + Homologation + endpoint Sandbox, uma notificação sem ambos os headers pode solicitar consulta autenticada de um pedido já vinculado ao banco. Identidade, referência, valor e moeda são conferidos na resposta do provedor antes de atualizar o saldo. Status e valores do corpo recebido não são aceitos como autoridade. O retorno é 202 após consulta válida. Assinatura inválida, pedido desconhecido e corpo vazio continuam rejeitados com 401. Produção mantém a validação criptográfica obrigatória. Este ensaio não comprova callback assinado do provedor.

Recorrência recebe eventos em `/api/v1/integrations/pagbank/subscriptions/webhook`. Configurar essa URL em `/preferences/notifications` do Sandbox. E-mails automáticos de cliente/lojista foram desabilitados nesse ambiente de testes. Eventos de plano/cliente não são tratados como assinaturas. O vínculo de uma assinatura nova é persistido somente após consulta autenticada e validação. Para não exceder o tempo limite do callback, a conferência das faturas é feita pelo `BillingWorker` a cada minuto, a partir dos vínculos persistidos, inclusive após reinício. Nenhum saldo é alterado pelo conteúdo do webhook.

### Pagamentos e estornos

- Pix de R$ 5 aprovado e estornado integralmente: `ORDE_E7828D91-0575-49A4-BAC9-D8F3D71C6CD6`. Repetição da mesma operação não duplicou o estorno; pago voltou a zero.
- Visa de R$ 10 aprovado: `ORDE_76C7A1B2-D827-45C3-BF97-8670B3084A08`. Estorno parcial de R$ 4 pendente porque o provedor respondeu `40008 refund_temporarily_unavailable / Transaction is not found`. O saldo conserva o valor recebido até confirmação externa.
- Mastercard de R$ 5 aprovado: `ORDE_B18E7F0B-449D-4D39-BDD8-5E44CCB0608E`. Solicitação de estorno integral permanece pendente; não declarar aprovação do estorno.
- Cartão recusado: `ORDE_4D222138-607F-4DF3-93FD-06C46274E985`, saldo pago zero, sem retenção indevida.
- Novo Pix após a correção: `ORDE_E1EB0909-039D-4BF1-9351-D1F594AC3842`, aprovado e callbacks aceitos via consulta autenticada.
- Recorrência: `SUBS_7B5265BE-62E5-4290-B6A8-59B8374ACEB3`, primeira fatura de R$ 10 paga e conciliada. Cancelamento pelo sistema confirmado. Estorno `REFU_391BB56D-778D-44C5-AFD2-1006796B0ED0` retornou SUCCESS no Sandbox. A criação dessa primeira assinatura foi concluída por diagnóstico autenticado após falha da massa Visa; testar novamente a criação ponta a ponta pelo sistema com a massa Mastercard oficial.

O Sandbox de recorrência rejeitou a massa Visa publicada com `unprocessable_card_data`; a massa Mastercard oficial funcionou. Para estorno integral, a documentação diz que `amount` pode ser omitido, mas o Sandbox devolveu `parameter_required_missing`. A integração passou a enviar explicitamente o valor integral em centavos e BRL, após validar a fatura. Continua impedido o estorno parcial de recorrência.

Validação local: 249 testes unitários e 9 testes financeiros PostgreSQL aprovados; builds API/web aprovados. O ensaio PostgreSQL usa base nova exclusiva, pois a suíte cria registros com nomes únicos fixos. CI anterior `38443857851` passou; consultar também a execução do último commit.

Referências: [autenticidade](https://developer.pagbank.com.br/reference/validacao-de-autenticidade), [cartões fictícios de recorrência](https://developer.pagbank.com.br/reference/testar-sua-integracao-pagamentos-recorrentes), [webhooks de recorrência](https://developer.pagbank.com.br/reference/webhooks-assinaturas), [estorno de recorrência](https://developer.pagbank.com.br/reference/criar-estorno-de-pagamento).

### Pendências para aprovação oficial

Revalidar estornos dos cartões avulsos quando o Sandbox disponibilizar a operação; reunir os requests/responses sanitizados e encaminhar pelo responsável ao PagBank. Ciclos mensais futuros têm cobertura automatizada, mas não foram observados no Sandbox durante este ensaio. A aprovação oficial, credenciais de produção e callback assinado continuam dependendo do PagBank. Não marcar homologação oficial como concluída por conta de deploy ou de aprovação de testes internos.
