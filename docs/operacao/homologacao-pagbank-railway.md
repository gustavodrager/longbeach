# Homologação PagBank no Railway

Autorizada pelo responsável em 13/10/2026, após revogar a limitação anterior a localhost. Projeto `longbeach-os`, ambiente `staging` (`0c988eb2-1c63-4910-bbd1-0d4baf266188`). Não copiar a base local, pois contém identidades reais, nem dados ou segredos de produção.

## Recursos e acesso

- Web: `web-homolog`, endereço `https://web-homolog-staging.up.railway.app`.
- API: `api-homolog`, somente rede privada, porta 8080.
- PostgreSQL 18: `Postgres-pbZb`, base nova `longbeach_pagbank_homolog`, volume próprio e sem proxy TCP público.
- Web encaminha `/api/` à API privada, preservando login, cookie HttpOnly e proteção CSRF no mesmo domínio. O serviço web usa Dockerfile e nginx específicos desta homologação.
- Credenciais de sessão e senha de avaliação geradas exclusivamente para este ambiente. Segredo Sandbox de Pedidos já validado, sem uso do token de produção. Nunca registrar esses valores neste documento.
- Cliente fictício segregado para repetição de recorrência: `recorrencia@homolog.longbeach.invalid`, perfil Student, senha própria derivada do segredo exclusivo de homologação e entregue separadamente. Não possui gestão financeira.
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
- Recorrência: `SUBS_7B5265BE-62E5-4290-B6A8-59B8374ACEB3`, primeira fatura de R$ 10 paga e conciliada. Cancelamento pelo sistema confirmado. Estorno `REFU_391BB56D-778D-44C5-AFD2-1006796B0ED0` retornou SUCCESS no Sandbox. A criação dessa primeira assinatura foi concluída por diagnóstico autenticado após falha da massa Visa; o ensaio ponta a ponta adicional está registrado abaixo.

O Sandbox de recorrência rejeitou a massa Visa publicada com `unprocessable_card_data`; a massa Mastercard oficial funcionou. Para estorno integral, a documentação diz que `amount` pode ser omitido, mas o Sandbox devolveu `parameter_required_missing`. A integração passou a enviar explicitamente o valor integral em centavos e BRL, após validar a fatura. Continua impedido o estorno parcial de recorrência.

A segunda assinatura efetivada, `SUBS_F5641612-1B5F-4E0B-AEFB-CF5098496F20`, foi criada integralmente pela API do sistema com massa oficial válida: primeira cobrança de R$ 10 aprovada, cancelamento pela tela do cliente confirmado e estorno integral pela API corrigida confirmado. Pagamento local `fc20b166-7512-42c9-9b5f-dc52b0597733` terminou Refunded, R$ 10 estornados, R$ 0 pagos e nenhuma devolução pendente. Ambas as assinaturas efetivadas estão CANCELED no PagBank.

Duas tentativas sem assinatura externa foram preservadas como evidência: CPF já cadastrado (`8f41c136-505a-45e7-bbdc-35d751d5c639`) e CPF inválido de um exemplo da documentação (`18a62af9-db76-4a95-bf05-8b0702435c0c`). O provedor retornou 409 e retentativas da mesma chave passaram a retornar `idempotency_key_validation`. Nenhuma assinatura correspondente foi localizada nas consultas realizadas. As respostas originais completas não foram persistidas; erros posteriores de idempotência e ausência na lista não comprovam rejeição definitiva da primeira chamada. Essas duas intenções permanecem Creating até confirmação do provedor. A correção abaixo não libera retroativamente operações incertas.

A retomada automática de estornos de comandas também foi corrigida: valores `3` e `3.00` restaurados do PostgreSQL não podem ser interpretados como operações diferentes. A repetição confere comanda, pagamento, operador, valor e motivo contra o registro persistido antes de reutilizar seu fingerprint original, preservando compatibilidade com solicitações já pendentes e rejeitando alterações de operação.

Validação local: 249 testes unitários e 27 testes financeiros/comandas PostgreSQL aprovados; builds API/web aprovados. O ensaio PostgreSQL usa base nova exclusiva, pois a suíte cria registros com nomes únicos fixos. CI `38446570273` passou em PostgreSQL 17, PostgreSQL 18 e frontend; consultar também a execução do último commit de retomada de estornos.

Referências: [autenticidade](https://developer.pagbank.com.br/reference/validacao-de-autenticidade), [cartões fictícios de recorrência](https://developer.pagbank.com.br/reference/testar-sua-integracao-pagamentos-recorrentes), [webhooks de recorrência](https://developer.pagbank.com.br/reference/webhooks-assinaturas), [estorno de recorrência](https://developer.pagbank.com.br/reference/criar-estorno-de-pagamento).

### Pendências para aprovação oficial

Obter confirmação do PagBank sobre as duas intenções antigas sem resposta original completa e revalidar estornos dos cartões avulsos quando o Sandbox disponibilizar a operação; aguardar a análise do chamado **1464208386**, enviado com os requests/responses sanitizados em 13/10/2026. O recibo informa retorno em até **48 horas úteis**. Ciclos mensais futuros têm cobertura automatizada, mas não foram observados no Sandbox durante este ensaio. A aprovação oficial, credenciais de produção e callback assinado continuam dependendo do PagBank. Não marcar homologação oficial como concluída por conta de deploy ou de aprovação de testes internos.


### Correção de adesões e consulta de pendências

A adesão consulta o assinante pelo documento e só reutiliza cadastro com referência do próprio usuário ou de uma assinatura local desse usuário. Documento, nome ou e-mail isolados não autorizam alteração do cliente. O novo cartão é atualizado pelo endpoint de dados de pagamento antes da assinatura com customer.id; o campo de cartão embutido na criação seria ignorado pelo PagBank para cliente existente. Há consentimento opcional explícito, persistido por operação, para o alcance da atualização nas demais mensalidades do mesmo assinante.

Plano, atualização do cartão e criação usam chaves distintas. Um bloqueio de sessão PostgreSQL por responsável cobre as chamadas externas; outra adesão do mesmo responsável fica bloqueada enquanto alguma criação enviada permanecer incerta, inclusive após timeout/reinício. CPF/CNPJ inválido é recusado antes de registrar uma intenção.

Falha de validação conhecida na primeira resposta de criação ou atualização de cartão gera estado Rejected com motivo sanitizado. A tentativa e sua chave permanecem terminais; uma correção usa nova intenção. Timeout, erro de idempotência e resposta desconhecida continuam Creating. O indicador CreationAttempted é salvo antes do envio. A retomada consulta a referência e nunca reenvia uma cobrança incerta com outro criptograma. A migration marca conservadoramente todas as intenções antigas como já enviadas.

A tela distingue retomada anterior ao envio, rejeição e consulta de operação enviada. O endpoint autenticado `POST /api/v1/me/billing/subscriptions/{id}/refresh` consulta apenas a assinatura do próprio usuário, sem pedir cartão ou CVV. Uma referência positiva validada recupera o vínculo; ausência na lista mantém a pendência. O worker também recupera vínculos por referência. Pagamentos integralmente estornados permanecem no histórico e não impedem nova adesão válida após cancelamento.

Consulta de 13/10 às 15:45 BRT: os estornos avulsos Visa R$ 4 e Mastercard R$ 5 seguem sem confirmação, com erro 40005/idempotency_key_in_use nas mesmas operações após a indisponibilidade 40008. Conservar recebido R$ 10/R$ 5, estornado zero e pendente R$ 4/R$ 5; não gerar outra chave para aparentar sucesso. Requests/responses sanitizados foram anexados ao chamado **1464208386**, enviado com autorização pelo formulário oficial Pipefy. A tela confirmou recebimento por PagBank Internet S.A.; o recibo das 16:26 BRT, fornecido pelo usuário, confirmou o número e o prazo de até 48 horas úteis. O registro local está em `outputs/pagbank-suporte-status-2026-10-13.json`, com comprovante `outputs/pagbank-suporte-enviado-2026-10-13.png` no workspace principal. O chamado inclui também as duas intenções de assinatura sem confirmação; seu recebimento não encerra essas pendências nem representa aprovação da homologação.


### Resultado do reuso de assinante (16:11 BRT)

API e web publicadas somente em staging no commit `4b7cb3a960733bb1a570d03242f0da13f19e21f1`, deploys `4d8dc352-a0e9-4fc1-95c6-26962aa44429` e `c79977bb-22be-47bd-9028-ee1ccf1f71e9`, ambos SUCCESS. CI [38452064007](https://github.com/gustavodrager/longbeach/actions/runs/38452064007) aprovado em frontend e PostgreSQL 17/18.

Ensaio pelo sistema com o cliente fictício segregado:

- Documento inválido bloqueado antes da criação de intenção.
- Cadastro PagBank de outro usuário recusado, mesmo com autorização de troca de cartão: Rejected, sem cobrança.
- Primeira adesão `7fd8fbd4-e1f9-4ed0-a1c1-f0377297bd28`: cobrança de R$ 10 aprovada; cancelamento e estorno integral confirmados.
- Nova adesão do mesmo documento sem consentimento separado: Rejected, sem cobrança, permitindo nova tentativa.
- Reuso autorizado `0467a04c-dba6-4c20-8564-e327e8d2e914`: atualização do cartão, assinatura e primeira fatura de R$ 10 aprovadas; cancelamento e estorno integral confirmados.
- Conta final: R$ 0 pagos, R$ 0 em confirmação e dois pagamentos Refunded de R$ 10 cada. As duas assinaturas efetivadas neste ensaio estão CANCELED. O saldo a pagar de R$ 10 representa a mensalidade fictícia reaberta pelo estorno, não uma cobrança nova.

Evidência sanitizada local: `outputs/homologacao-recorrencia-reuso-2026-10-13.json` no workspace de operação. Não contém senha, token, CPF ou dados do cartão. A tela das duas intenções antigas foi conferida: consulta sem cartão, sem cancelamento artificial e sem novo POST de cobrança.

Produção preservada: API `67349c91-372b-4fbd-ab2a-603d0191fbdb`/`5ce7cbf`, web `a6770c1e-084b-4ddd-a8ec-947e2667c143`/`6cbdd1a`.
