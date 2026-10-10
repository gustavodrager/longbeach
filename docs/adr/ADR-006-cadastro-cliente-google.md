# ADR-006 — Cadastro de clientes com Google

Status: implementado na cópia isolada; publicação e ativação hospedada pendentes de aprovação.

## Decisão

O mesmo botão Google permite retornar a uma conta vinculada ou criar uma conta de cliente, quando `Authentication:Google:ClientRegistrationEnabled=true`. O valor padrão é `false`. Desligar essa opção impede novos cadastros e preserva o acesso de contas já vinculadas. Não exige migration.

A API valida assinatura, emissor, audiência, expiração e e-mail verificado antes de processar a identidade. O identificador estável é `sub`. Nome e e-mail fornecidos pelo navegador não são aceitos fora das claims validadas. O frontend consulta `/api/v1/auth/options` para apresentar as opções disponíveis, sem receber listas de e-mails ou configurações privadas. Falha de consulta não anuncia cadastro disponível.

Novas contas recebem exclusivamente `Student` (cliente na interface), sem permissões operacionais. A senha armazenada é aleatória e não é divulgada; Google é o método de entrada. `googleLinked` acompanha a sessão para orientar a página de segurança. A vinculação autenticada de primeiro acesso continua usando a conta da equipe existente.

A criação é serializada em transação PostgreSQL, com índices únicos de e-mail e GoogleSubject como proteção adicional. Repetições e acessos simultâneos não duplicam usuários. Contas inativas, pendentes, colisões de e-mail e vínculos com outro subject não são reativados ou sobrescritos. O cadastro não atribui papéis da equipe nem cria matrícula, reserva ou vínculo operacional por nome/e-mail. Esses vínculos continuam sob conferência da gestão. A auditoria existente registra criação e atribuição do papel, ocultando hashes e tokens.

A lista `AllowedEmail` continua autorizando a compatibilidade de login por e-mail de contas existentes; não é requisito para clientes vinculados. O provisionamento de proprietários permanece separado e deve ficar desligado durante a ativação do cadastro público.

## Interface

Entrada orientada a clientes e equipe; mensagem explícita de criação de conta e conferência dos vínculos. Na área pessoal, clientes sem vínculos recebem acesso ao perfil e à solicitação de conferência. Telefone permanece opcional. A segurança de contas vinculadas direciona ao Google. Solicitações e pagamentos continuam sujeitos às regras existentes; não são confirmados pelo cadastro.

Em 10/10/2026, por solicitação do responsável, `/login` passou a oferecer somente Google. Campos de usuário/senha, envio de senha e sugestões de entrada alternativa foram removidos dessa página. Indisponibilidade do provedor ou falha de consulta têm mensagem explícita e orientação para tentar novamente. A recuperação direciona ao Google. Endpoints e ferramentas internas de senha/primeiro acesso permanecem compatíveis nesta alteração de interface.

Papéis administrativos são atribuídos explicitamente pelo operador a identidades previamente verificadas, com auditoria; não são derivados do domínio do e-mail nem do cadastro público. Na homologação, a conta institucional recebeu `Administrator` e a conta pessoal do proprietário indicado recebeu `Owner`. Ambas usam Google e têm todas as permissões do catálogo. Os endereços ficam fora do código versionado; o cadastro público continua criando somente `Student`.

## Homologação e ativação

1. Usar OAuth Client ID próprio do Long Beach OS, do tipo aplicação Web. Autorizar somente as origens necessárias para o ambiente. A homologação atual usa `http://localhost:5321`, com `http://localhost` e `http://localhost:5321` autorizados, CORS restrito e API no mesmo host, conforme o [guia oficial de configuração](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid). Validar também cookies de sessão, CSP e abertura do popup nesse ambiente.
2. Configurar `Authentication__Google__Enabled=true`, `Authentication__Google__ClientId=<ID do ambiente>` e `Authentication__Google__ClientRegistrationEnabled=true` somente no ambiente de homologação autorizado. Manter `Authentication__Google__ProvisionAllowedEmailsAsOwners=false`. Não há client secret no navegador.
3. Validar com conta Google de teste: primeiro cadastro, retorno, logout, renovação da sessão, acesso apenas aos próprios dados e conferência dos vínculos pela gestão. Validar também conta existente, Google indisponível e tela de primeiro acesso da equipe.
4. Validar Google Identity Services no navegador externo/mobile utilizado. O fluxo nativo de autenticação de aplicativos das lojas não foi implementado nesta etapa.
5. Após aceite, solicitar aprovação para envio ao repositório/publicação/ativação. Para interromper inscrições, desligar apenas `ClientRegistrationEnabled`; contas vinculadas continuam entrando. Não apagar usuários criados.

## Evidências e limites

Testes de integração usam o validador JWT real com emissor e chaves exclusivamente locais: assinatura inválida, audiência/emissor incorretos, token vencido, e-mail não verificado, colisões, inatividade, concorrência, retorno, auditoria, permissões e desligamento do cadastro. A interface possui testes de opções, falhas, acesso e segurança. Google Identity Services foi validado com as duas contas autorizadas em 10/10/2026 no ambiente local; ver `docs/operacao/homologacao-local.md`. Publicação e configuração de produção permanecem pendentes.

Referência: [validação oficial de tokens Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
