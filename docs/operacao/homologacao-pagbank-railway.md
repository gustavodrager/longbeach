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

Pix e cartão usam exclusivamente `https://sandbox.api.pagseguro.com/`. Callback: `https://web-homolog-staging.up.railway.app/api/v1/integrations/pagbank/webhook`. EDI de produção, recorrência e demonstração pública estão desativados. A aplicação recusa inicialização da homologação se essas restrições forem violadas.

## Critério de entrega

Publicar por commit fixado, testar login, recarga de sessão, consultas protegidas e configuração Sandbox pela URL pública. Criar apenas catálogo e operações fictícias. Registrar evidência de notificações assinadas separadamente de testes de disponibilidade: URL acessível não equivale a homologação aprovada.

O PagBank exige avaliação dos requests/responses: https://developer.pagbank.com.br/docs/solicitar-homologacao. Não enviar automaticamente o formulário, credenciais ou mensagens ao suporte. Recorrência depende de credencial própria e ensaio separado. Integração administrativa PagVendas depende de contrato oficial ainda não confirmado.

Após o aceite, revogar a conta de avaliação e retirar a exposição pública quando não for mais necessária. Preservar evidências sanitizadas. Não promover banco, credenciais ou conta de homologação a produção.

## Publicação e verificação em 13/10/2026

Artefato `c0953ca4f0a5f5b33a7809712395914d4ee76b6d`, branch `codex/homologacao-pagbank-20261013`, revisão [PR #30](https://github.com/gustavodrager/longbeach/pull/30). Deploys SUCCESS: API `46c7751f-a68b-42f3-8c91-0c396eec543b`, web `c852987c-765c-4126-b2c1-f76e3c6c8cf5`, banco `29dea8e8-fcd9-4323-93f0-2029eb9cbdf3`. Production conserva seus deploys anteriores; nenhuma pendência de configuração em staging ou production.

Login por HTTPS e recarga de sessão confirmados no Chrome. Consultas autenticadas retornaram 200; catálogo sem sessão retornou 401. A consulta da chave de cartão Sandbox funcionou e webhook sem assinatura retornou 401. Criados dois produtos fictícios (Água — TESTE, R$ 5; Lanche — TESTE, R$ 10), contagem inicial auditada de 100 unidades de cada no local Bar e caixa fictício. Uma venda avulsa de Água gerou o Pix Sandbox `ORDE_E7828D91-0575-49A4-BAC9-D8F3D71C6CD6`, exibindo QR Code inicialmente Pending e depois Approved na consulta ao provedor, com comanda atualizada para pago. Nenhum pagamento real.

Importante: a confirmação Sandbox foi obtida por consulta ao provedor; ela não comprova o callback assinado. Houve também chamadas externas ao webhook com resposta 401; sem registro dos headers não é possível afirmar se faltou assinatura ou se ela era inválida. Preservar a rejeição e esclarecer o formato enviado pelo Sandbox antes de declarar notificações homologadas. Cartão, estorno, idempotência externa e recorrência exigem ensaios adicionais.

Validação local final: 244 testes unitários e 8 testes da tela de login aprovados; builds API/web aprovados. A primeira execução CI aprovou os 264 testes de integração PostgreSQL 17, mas apontou uma expectativa antiga de URL em BillingRulesTests (`?type=webhook`). Atualizada para o endpoint tipado `/public-keys/webhook`, validado no provedor, preservando as verificações criptográficas e de cache. Consultar a execução mais recente para o resultado global; não interpretar apenas o deploy como aprovação de toda a suíte.
