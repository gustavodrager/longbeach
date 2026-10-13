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
