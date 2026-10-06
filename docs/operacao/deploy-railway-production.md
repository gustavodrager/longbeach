# Deploy de Production no Railway

## Escopo e isolamento

Este runbook publica a base standalone em recursos exclusivos do projeto Railway `longbeach-os`:

- web oficial: `https://longbeach.quebranunca.com.br`;
- API oficial: `https://api.longbeach.quebranunca.com.br`;
- PostgreSQL: serviço `Postgres` privado do projeto;
- serviços: `api` e `web`.

A conta Railway e o namespace DNS `quebranunca.com.br` são compartilhados somente como infraestrutura administrativa. O projeto, os serviços, banco, usuários, autenticação, migrations, variáveis, secrets, logs, backups e deploy do Long Beach OS são próprios. Não use referências de serviço, banco, volume, variável ou domínio interno da Plataforma QuebraNunca nem do projeto legado.

O endereço `longbeach.quebranunca.com.br` atende hoje o Long Beach OS standalone no serviço `web`; a API usa `api.longbeach.quebranunca.com.br`. O serviço Node/SQLite legado permanece preservado em seu projeto e endereço técnico Railway para consulta e retorno. Não haverá registro de `longbeach.com.br`, nova zona DNS nem nova conta Cloudflare.

A infraestrutura Railway é descrita em `.railway/railway.ts` como **snapshot declarativo da fase corrente**, e não como desenho atemporal do estado final. O snapshot corrente registra `api.longbeach.quebranunca.com.br` no serviço `api` e `longbeach.quebranunca.com.br` no serviço `web`. A promoção financeira de 2026-10-05 vincula somente `api` e `web` à revisão validada `e25bf9cd2e0f2242ac123c53dbc519e2a3753b24`, na branch `codex/historico-financeiro-sincronizacao`. O CI passou e ambos os serviços responderam aos health checks. Os serviços auxiliares conservam sua fonte anterior. O coletor EDI permanece aguardando as credenciais específicas; consulte `docs/arquitetura/historico-financeiro-integracoes.md`. O binding de `preview.longbeach.quebranunca.com.br` foi removido em 2026-10-05; mantenha os domínios técnicos Railway para health check e retorno.

### Sincronização obrigatória do snapshot

Antes de qualquer mudança, execute `railway config pull`, revise o diff e confirme que o arquivo representa o estado live esperado. Para uma mudança planejada pelo IaC, edite o snapshot da fase, execute `railway config plan`, revise e só então aplique.

Imediatamente após **cada** associação ou remoção de domínio, inclusive quando feita pelo painel ou CLI:

1. execute `railway config pull` no projeto correspondente;
2. revise o diff e confirme que só a mutação esperada foi capturada;
3. registre esse snapshot em commit próprio, sem secrets;
4. execute `railway config plan` novamente e exija plano vazio ou apenas diferenças já explicadas;
5. interrompa a próxima mutação se houver drift inesperado.

O legado pertence a outro projeto. Sua remoção de domínio deve ser registrada no repositório/runbook que o administra; recursos legados nunca são importados para o IaC do `longbeach-os`.

### Variáveis declarativas e verificação live

Valores não secretos e estáveis devem aparecer explicitamente no IaC da fase, incluindo `Authentication__CookieDomain`, `Authentication__Jwt__Issuer`, `Authentication__Jwt__Audience`, origens CORS, flags desabilitadas de migration/bootstrap/seed e `VITE_API_URL`. Use `preserve()` somente para secrets, PII de bootstrap, conexões gerenciadas ou valores gerados pelo provedor, como a chave JWT, connection string e credenciais temporárias do Owner.

Antes de cada build da web, promoção e corte, confira diretamente nas variáveis live do Railway, sem exportar um dump com secrets:

| Serviço | Variável | Valor exigido em Production |
|---|---|---|
| `api` | `Authentication__CookieDomain` | `longbeach.quebranunca.com.br` |
| `api` | `Authentication__Jwt__Issuer` | `https://api.longbeach.quebranunca.com.br` |
| `api` | `AllowedHosts` | `api.longbeach.quebranunca.com.br;<api-tecnica>.up.railway.app;healthcheck.railway.app` |
| `api` | `Cors__AllowedOrigins__0` | `https://longbeach.quebranunca.com.br` |
| `api` | demais `Cors__AllowedOrigins__*` | ausentes ou repetição da origem oficial; qualquer host adicional exige justificativa para smoke |
| `api` | `ReverseProxy__TrustAllForwarders` | `false` |
| `web` | `VITE_API_URL` | `https://api.longbeach.quebranunca.com.br` |

Falhe o build ou promoção se o valor live, o snapshot e esta tabela divergirem. No estado atual, a origem CORS oficial é `https://longbeach.quebranunca.com.br`; o preview foi removido do binding e do IaC.

## Configuração dos serviços

### API

- contexto de build: raiz do repositório;
- Dockerfile: `deploy/api.Dockerfile`;
- porta interna: `8080`;
- health check: `/health/ready`;
- pre-deploy command: `dotnet LongBeach.Api.dll --migrate-only`;
- timeout do pre-deploy: `300` segundos;
- réplicas no primeiro bootstrap: `1`.

O comando `--migrate-only` aplica migrations pendentes e encerra com código diferente de zero quando houver falha. Ele não abre porta HTTP, não cria usuário e não inicia hosted services. `Database__MigrateOnStartup` permanece `false` em Production.

### Web

- contexto de build: raiz do repositório;
- Dockerfile: `deploy/web.Dockerfile`;
- porta interna: `8080`;
- health check: `/healthz`;
- argumento de build: `VITE_API_URL=https://api.longbeach.quebranunca.com.br`.

`VITE_API_URL` é incorporada ao bundle no build. Toda mudança desse valor exige novo build e deploy do serviço web.

## Variáveis da API

Configure as variáveis abaixo no serviço `api`. Use referência ao PostgreSQL do próprio projeto em vez de copiar credenciais.

```dotenv
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://+:8080
AllowedHosts=api.longbeach.quebranunca.com.br;<api-tecnica>.up.railway.app;healthcheck.railway.app

ConnectionStrings__LongBeach=Host=${{Postgres.PGHOST}};Port=${{Postgres.PGPORT}};Database=${{Postgres.PGDATABASE}};Username=${{Postgres.PGUSER}};Password=${{Postgres.PGPASSWORD}};SSL Mode=Require

Authentication__Jwt__Issuer=https://api.longbeach.quebranunca.com.br
Authentication__Jwt__Audience=LongBeach.OS.WebMobile
Authentication__Jwt__SigningKey=<segredo-aleatorio-de-alta-entropia>
Authentication__CookieDomain=longbeach.quebranunca.com.br
Authentication__MobileAllowedOrigins__0=capacitor://localhost
Authentication__MobileAllowedOrigins__1=https://localhost

Cors__AllowedOrigins__0=https://longbeach.quebranunca.com.br
Database__MigrateOnStartup=false
Authorization__SeedOnStartup=false
HealthChecks__DatabaseEnabled=true
ReverseProxy__TrustAllForwarders=false
```

Sele `Authentication__Jwt__SigningKey` no Railway. A chave deve ter pelo menos 32 caracteres e deve ser exclusiva de Production.

Mantenha `healthcheck.railway.app` em `AllowedHosts`: o Railway usa esse host nos probes. A tentativa sem ele deixou a revisão pendente mesmo com o processo saudável. Substitua `<api-tecnica>` pelo host técnico real e não aceite curingas.

Mantenha `ReverseProxy__TrustAllForwarders=false` até existir política validada de proxies/redes confiáveis. Enquanto isso, use os logs HTTP do Railway e correlation IDs para investigação; não trate o endereço observado pela aplicação como IP confiável do cliente. Qualquer ativação futura exige lista de proxies/redes conhecidas, teste de spoofing e nova decisão operacional.

`Authentication__CookieDomain` usa `longbeach.quebranunca.com.br`, o menor domínio comum entre web e API. Não configure `quebranunca.com.br`, pois isso ampliaria o cookie anti-CSRF a outros subdomínios. O refresh token continua em cookie `HttpOnly` restrito ao host da API.

### Origem CORS no estado atual

Permita no CORS somente `https://longbeach.quebranunca.com.br`. O legado permanece em outro domínio técnico Railway. Não acrescente o preview removido nem um domínio técnico à lista de origens web sem um ensaio justificado. O cookie anti-CSRF continua restrito a `longbeach.quebranunca.com.br`, e o refresh token permanece em cookie `HttpOnly` host-only da API.

O preview foi desativado. Use a conta Owner autorizada no endereço oficial e encerre sessões de teste após validação. Health checks pelos domínios técnicos não exigem exceção CORS.

## Bootstrap único do primeiro Owner

O bootstrap é desabilitado por padrão, só executa quando `ASPNETCORE_ENVIRONMENT=Production` e não altera a senha de um usuário já existente. Execute-o com uma única réplica **antes de depender do preview**.

1. Confirme que o pre-deploy `--migrate-only` terminou com sucesso.
2. Configure temporariamente no serviço `api`:

```dotenv
Authorization__SeedOnStartup=true
Bootstrap__InitialOwner__Enabled=true
Bootstrap__InitialOwner__Name=<nome-do-proprietario>
Bootstrap__InitialOwner__Email=<email-do-proprietario>
Bootstrap__InitialOwner__Password=<senha-inicial-forte>
```

3. Sele `Bootstrap__InitialOwner__Password` antes do deploy.
4. Faça o deploy com uma réplica e aguarde `/health/ready` responder `200` no domínio técnico e no domínio oficial da API.
5. Execute um smoke direto contra a API, sem navegador e sem depender de cookies do preview. Use `X-LongBeach-Client: mobile`, mantenha tokens somente em memória e nunca os imprima:
   1. `POST /api/v1/auth/login` com e-mail/senha iniciais; exigir `200` e papel `Owner` na resposta;
   2. `GET /api/v1/auth/me` com o access token; exigir o mesmo usuário e papel `Owner`;
   3. `POST /api/v1/auth/refresh` com o refresh token no corpo; exigir rotação e um novo access/refresh token;
   4. `POST /api/v1/auth/logout` com o refresh token rotacionado; exigir `204`;
   5. repetir o refresh anterior e exigir rejeição, comprovando revogação.
6. Imediatamente defina `Bootstrap__InitialOwner__Enabled=false` e `Authorization__SeedOnStartup=false`.
7. Remova `Bootstrap__InitialOwner__Password`, `Bootstrap__InitialOwner__Name` e `Bootstrap__InitialOwner__Email`; aplique nova revisão.
8. Confira nas variáveis live que o bootstrap está desabilitado e que os três valores temporários não existem. Só então prossiga ao preview.

Quando habilitado, o bootstrap falha antes de acessar o banco se nome, e-mail ou senha estiverem ausentes. A senha deve ter de 14 a 256 caracteres e nunca é escrita nos logs. Reexecutar com o mesmo e-mail não duplica o usuário nem o papel.

No preview, valide o fluxo web com cookies: login, recarga com refresh, perfil `Owner` e logout. Antes do corte, o Owner deve abrir **Segurança**, trocar obrigatoriamente a senha inicial e entrar novamente com a nova senha. A troca revoga as sessões existentes; confirme que a senha de bootstrap falha e repita refresh/logout com a senha final. O corte fica bloqueado enquanto essa troca não estiver comprovada.

## Domínios e TLS — estado corrente

A fase de promoção para o endereço oficial foi concluída em 2026-10-05. O endereço público da web é somente `https://longbeach.quebranunca.com.br`; a API permanece em `https://api.longbeach.quebranunca.com.br`. O preview foi removido do serviço `web` e os serviços técnicos continuam disponíveis para health check e retorno.

O `web` e a `api` estão vinculados a `gustavodrager/longbeach`. A fase inicial de 2026-10-05 usou `main`; a promoção UX posterior usa a revisão validada `codex/ux-identidade-global-20261005`, conforme `revisao-ux-identidade-2026-10-05.md`. O build publicado inclui o módulo de Importações e o login Google. `VITE_API_URL` aponta para a API oficial, e CORS permite a origem web oficial.

Na promoção inicial do endereço, `railway config pull` foi revisado e o plano ficou sem drift. A promoção UX posterior detectou duas diferenças de branch: o trigger CLI estava correto, mas faltava a branch na configuração do ambiente. O cadastro individual de Owner demonstrou o retorno a `main` em uma atualização automática; a fonte de API e web foi corrigida por patches revisados de Production, com branch e commit fixados, conforme `revisao-ux-identidade-2026-10-05.md`. A API e a web concluíram o deploy com sucesso; readiness da API e health check da web responderam `200`. A tela `/importacoes` confirmou dois lotes no PostgreSQL, ambos `NeedsReview`: `fonte-0.xlsx` (80 linhas) e `fonte-1.xlsx` (1.031 linhas). Os dados continuam em staging e nenhuma linha foi aplicada aos cadastros.

### Retorno da versão web/API

1. Se a versão publicada falhar, use o deploy anterior de `web` e `api` no Railway ou restaure os digests anteriores compatíveis com o schema.
2. Mantenha `https://longbeach.quebranunca.com.br` no serviço standalone `web`; não reassocie o domínio ao legado como parte de uma falha apenas de aplicação.
3. Preserve o serviço, o banco e os dados do legado no projeto separado, acessíveis pelo endereço técnico que o administra.
4. Sincronize `.railway/railway.ts` com `railway config pull`, revise, faça commit do snapshot e exija `railway config plan` sem drift.

Essa promoção do endereço não autoriza mudar a fonte oficial de escrita nem aplicar linhas dos lotes em staging. Qualquer migração para cadastros operacionais segue o processo de reconciliação e aceite humano descrito no plano de transição.

## Smoke tests

Os domínios técnicos gerados pelo Railway provam health e entrega estática. O fluxo de cookies é validado no endereço oficial, que compartilha o domínio pai com a API:

```bash
curl --fail --silent --show-error https://<api-tecnica>.up.railway.app/health/live
curl --fail --silent --show-error https://<api-tecnica>.up.railway.app/health/ready
curl --fail --silent --show-error https://<web-tecnica>.up.railway.app/healthz
curl --fail --silent --show-error https://<legado-tecnico>.up.railway.app/health
```

```bash
curl --fail --silent --show-error https://api.longbeach.quebranunca.com.br/health/live
curl --fail --silent --show-error https://api.longbeach.quebranunca.com.br/health/ready
curl --fail --silent --show-error https://longbeach.quebranunca.com.br/healthz
```

Além das respostas públicas:

- confirmar que somente `https://longbeach.quebranunca.com.br` recebe CORS com credenciais;
- confirmar que a tela web e `/importacoes` carregam pelo endereço oficial;
- entrar com o Owner e recarregar a página para provar refresh por cookie;
- sair e confirmar que a sessão não é restaurada;
- confirmar que a API rejeita `/api/v1/auth/me` sem access token;
- verificar nos logs somente IDs/correlation IDs, sem senha ou token;
- conferir que o bundle web contém `https://api.longbeach.quebranunca.com.br` e nenhuma URL localhost;
- confirmar que o legado continua acessível no domínio técnico preservado.

No estado atual, repetir a prova CORS no sentido inverso: a origem oficial deve ser a única origem web aceita e o preview não pode existir em CORS nem no binding Railway. A remoção do registro DNS do preview depende do administrador da zona DNS.

## Rollback

Se o deploy de aplicação falhar antes da migração operacional, reverta `api` e `web` para os deployments anteriores compatíveis com o schema e mantenha os domínios oficiais nos serviços standalone. Depois da autorização de migração operacional, se migration, readiness, login, CORS, refresh ou fluxo crítico falhar:

1. bloquear novas escritas no standalone e registrar o horário;
2. preservar e exportar as transações já confirmadas;
3. revogar as sessões standalone e remover `https://longbeach.quebranunca.com.br` do CORS e da validação de `Origin`; se essa revisão não puder ser confirmada, desabilitar a API pública;
4. só depois remover `longbeach.quebranunca.com.br` do serviço web standalone e reassociá-lo ao serviço legado preservado;
5. validar TLS/login do legado e confirmar que ele não consegue obter resposta autenticada da API standalone;
6. atualizar o snapshot da fase de rollback, executar `railway config pull`, revisar, fazer commit e exigir `railway config plan` sem drift;
7. restaurar os digests standalone compatíveis e corrigir migrations para frente;
8. reconciliar as transações preservadas antes de tentar novo corte.

Não apague o PostgreSQL, o serviço legado, o volume SQLite ou o D1 durante o rollback. O novo sistema só assume a fonte operacional depois da importação seca, reconciliação, teste de restauração e aceite previstos no plano de transição.

## Promoções posteriores à revisão UX

Antes de mudar a fonte de produção, conferir o commit integral e executar CI/build e revisão de telas. Publicar primeiro a API compatível; depois a web. Promover uma branch de revisão validada evita que outra publicação de `main` retire módulos já aceitos. Não mesclar ou promover por upload um snapshot antigo sem conciliar a fonte conectada. Preserve Google, lotes em revisão e as variáveis existentes. Registre commit, deployments, digests e evidência visual no relatório da promoção.

A promoção UX de 2026-10-05 está confirmada no commit `b31701a6190d7ba71db191914d9a33b152e95d91`: API `082f03d5-4b54-4d34-ac60-4583d4348d83`, web `56d1cb1d-22fd-46d0-b10b-1b1de5dc0dba`, ambos `SUCCESS`. Somente esses dois serviços foram atualizados. Migrations foram verificadas pelo pre-deploy, sem novas aplicações.

Ao sincronizar o snapshot, preserve branch e commit fixados explicitamente na configuração do ambiente de cada serviço oficial: o SDK assume `main` se a branch for omitida. O trigger criado por `service source connect` não basta para garantir a fonte de atualizações automáticas de configuração. Confira `source.branch` e `source.commitSha` em `describe-service`/`config pull --json`, além do deployment. Se faltarem, prepare a fonte no ambiente com `connect-service-source` em modo staged, reveja `get-staged-changes` e confirme apenas o patch autorizado. Exija plano sem drift após retirar os controles temporários. Não sobrescreva snapshots nem revele variáveis durante a inspeção.

## Inclusão direcionada de Owner Google

A lista `Authentication__Google__AllowedEmail` permite login; ela não é uma autorização para ampliar automaticamente o papel de todas as contas. Para uma inclusão individual já autorizada, preserve os e-mails existentes, acrescente apenas a nova conta e use o provisionamento direcionado da API. Não versão e-mails reais, senhas ou tokens neste runbook.

1. Confirme que a versão da API suporta `Authentication__Google__ProvisionOwnerEmails`, que o papel Owner já existe e que a nova conta está autorizada pelo responsável. Confira `source.branch` e `source.commitSha` na configuração de Production antes de alterar variáveis; fixe a revisão compatível por patch staged revisado quando necessário.
2. Em Production, configure `Authentication__Google__ProvisionOwnerEmails` apenas com os alvos aprovados. Todos precisam constar na allowlist. Campo presente, mas vazio ou com alvo fora da allowlist, interrompe o provisionamento antes de qualquer escrita.
3. Habilite temporariamente `Authentication__Google__ProvisionAllowedEmailsAsOwners=true` e publique a API compatível. O cadastro não altera contas inativas, não amplia papéis de contas fora dos alvos e é idempotente. Senhas aleatórias ficam somente como hash; o acesso da nova conta usa Google.
4. Confirme nos registros os IDs provisionados e a saúde do serviço. Desabilite imediatamente a flag, publique a configuração desabilitada e remova a lista temporária de alvos. Preserve a allowlist necessária para login. Não habilite seed nem bootstrap de senha.
5. Confirme que API e web continuam na revisão validada e que o serviço não registra novo provisionamento após reiniciar com a flag desabilitada.

Para conferir a inclusão sem escrita, use `dotnet LongBeach.Api.dll --verify-google-owners` separadamente de `--migrate-only`. Configure alvos explícitos na allowlist e uma janela finita em `Authentication__Google__VerifyOwnerChangesFromUtc`/`Authentication__Google__VerifyOwnerChangesToUtc`, com timestamps UTC `Z`. A consulta usa transação PostgreSQL `READ ONLY`, exige todos os alvos ativos com Owner e conta concessões auditadas de Owner fora deles durante a janela. Só registra contagens e resultado; divergência encerra com saída 1. Pode ser usada temporariamente como o único pre-deploy, quando não há novas migrations, mantendo o provisionamento desativado. Ao concluir, restaure `--migrate-only`, remova os três controles temporários com deploy automático desabilitado e publique a configuração final fixada. Não amplie a janela nem remova papéis sem conferir o lançamento original.

A inclusão como Owner não resolve erros do Google anteriores à emissão do token. Para `400 origin_mismatch`, confira o mesmo cliente OAuth Web usado pela web e API e cadastre `https://longbeach.quebranunca.com.br` em **Authorized JavaScript origins**, sem `/login`. A aplicação usa Google Identity Services com popup e callback; o cadastro de redirect URI não substitui a origem JavaScript. Ver [orientação oficial do Google](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

### Origem OAuth confirmada e teste de login — 2026-10-05

Após confirmação específica do responsável, às 23:36 UTC foi salva a origem `https://longbeach.quebranunca.com.br` no cliente OAuth Web identificado no projeto Long Beach OS. O Console informou **Cliente OAuth salvo**; a reabertura confirmou a origem oficial e a preservação da origem técnica existente. Nome e client ID continuam correspondentes ao cliente já usado pela web/API, e os redirect URIs permaneceram vazios. O Console informou propagação de cinco minutos a algumas horas.

Às 23:37 UTC, no Chrome, o login iniciado no domínio oficial abriu a seleção Google e concluiu com uma conta existente autorizada: o popup fechou, o painel administrativo carregou em `/` e **Minha conta** em `/conta` apresentou a identidade esperada, sem `origin_mismatch`. A evidência registra somente o resultado, sem nomes, e-mails ou tokens.

O papel Owner ativo da nova conta solicitada está confirmado por consulta PostgreSQL `READ ONLY`; seu primeiro login próprio ainda não foi testado. Preserve essa distinção ao comunicar a validação e não registre dados pessoais da conta em Git.

### Indicadores históricos da escola e dos mensalistas — 2026-10-05

API fixada no commit `ebe62e4539298f20736470ed703b42553fa4557a`, deployment `602b9408-8548-4d34-840b-415e62631e46` (`SUCCESS`). Web fixada em `c0c5681b86e7a676a833dfbc466e8a1203316cf3`, deployment `1133ca94-d497-416b-b196-8fcbb204e161` (`SUCCESS`); essa revisão acrescenta somente espaçamento/legibilidade da tabela à implementação validada em `ebe62e4`.

A API passou antes da promoção da web. Readiness da API e health da web responderam com sucesso; o resumo sem sessão respondeu `401`. O Chrome autenticado como Owner confirmou cartões com os valores das fontes, competências independentes, seleção explícita de mês sem reaproveitar aulas antigas, navegação ao controle e tabela semanal. Nenhuma reserva, cobrança ou importação foi criada por essa mudança; nenhuma migration nova foi necessária.

Validação: 100 testes unitários, 151 de integração PostgreSQL, 144 frontend, builds API/PWA e 9 testes de conversores no CI. Execuções CI `37401087180` e `37401769836` concluíram com sucesso. Configurações públicas e flags de segurança foram conferidas sem expor segredos. Cada promoção mudou exclusivamente o commit do serviço esperado; snapshots comparados e plano final sem diferenças.

Para reverter apenas a apresentação da tabela, a web anterior é `9ad64a03-2316-4255-a3c7-96f77b9fd1e1` em `ebe62e4`. Para retirar todo o incremento de indicadores, preserve os dados e use os deployments anteriores compatíveis: API `fdf7879d-bc64-4b4a-9a60-997f8ff7a7fa` e web `46c934a8-9aab-44ab-b6d1-7648b3e517f2`, ambos em `e25bf9c`. Após qualquer reversão, sincronize os commits fixados do snapshot e exija plano sem drift.

### Primeiro acesso individual e origem dos indicadores — 2026-10-06 UTC

API e web fixadas no commit `d2737a6a7e1d60d2b3a42d00ca595061aa0ebc85`, branch `codex/acessos-proprietarios-indicadores`. API `9944fe39-b009-4371-8bf6-5742bf57c687` e web `ad4c9880-96b3-40f5-9c11-17cb7c19e377`, ambas `SUCCESS`, uma réplica online e nenhuma pendência de configuração. A migration aditiva `20261006021750_IndividualFirstAccess` foi aplicada pelo pre-deploy único antes da web. As flags de bootstrap, seed e migration de startup continuam desativadas. O plano final confirmou `No changes.`; as diferenças de infraestrutura se limitaram à branch e ao commit desses dois serviços.

Validação: 107 testes unitários, 154 de integração PostgreSQL, 151 frontend e 9 de conversores, builds API/PWA e CI `37404722673` concluídos sem falha. Em produção, o Chrome preservou o Owner existente após atualizar a PWA e exibiu o histórico no início do painel, com competências explícitas. Os módulos operacionais sem registros mostram os dados necessários, sem converter ausência de cadastro em zero. Não foram criadas reservas, dívidas ou movimentações a partir de hipóteses sobre as planilhas.

Foram provisionadas exatamente duas contas Owner autorizadas, por comando único da API e configuração em stdin. A consulta `READ ONLY` confirmou contas ativas, primeiro acesso obrigatório, validade inicial de 72 horas e auditorias com hash oculto. Em ambas: login e `/auth/me` responderam `200`, acesso operacional e histórico Owner responderam `403`, logout respondeu `204`; as duas sessões temporárias de teste foram revogadas. A ativação por senha definitiva ou Google cabe aos titulares e não foi consumida na validação. A chave SSH criada para esse procedimento foi revogada após a conferência.

Antes de reverter a API, siga [as restrições de rollback do primeiro acesso](acesso-individual.md#verificação-e-retorno): uma API anterior não reconhece a limitação das contas pendentes. Os deployments anteriores são API `602b9408-8548-4d34-840b-415e62631e46` e web `1133ca94-d497-416b-b196-8fcbb204e161`. A web anterior pode ser restaurada separadamente, mas não fornece o fluxo de ativação. Preserve a migration e os registros existentes.

### Funcionamento semanal e encerramento à meia-noite — 2026-10-06

API e web publicadas no commit `5aa19ed6ef566181dd47626d9313fbdacc32220c`, branch `codex/funcionamento-quadra`. API `cbbc6656-221d-463d-a9ca-b16a1a8524ee` e web `aee754eb-7d79-4309-9f9b-5843be3c9d6a`, ambas `SUCCESS` e saudáveis. CI `37452202031` passou: 124 testes unitários, 155 de integração PostgreSQL, 154 frontend, conversores e builds. Nenhuma migration nova. A comparação de snapshots mostrou somente branch/commit de API e web, cada etapa registrada separadamente, com plano final `No changes.`.

Pelo cadastro autenticado oficial foi salva uma única quadra com os dias úteis e o horário de funcionamento confirmados pelo responsável, mantendo a conferência da agenda pendente. A leitura após navegar/recarregar preservou o cadastro; a agenda calculou 18 horas de funcionamento em um dia útil e fechamento no sábado, sem apresentar capacidade como tempo livre confirmado. Nenhuma reserva ou aula foi criada a partir de dados históricos. A auditoria e o bloqueio de gravações fora do funcionamento foram cobertos pelos testes PostgreSQL.

Mantenha uma revisão da API compatível com `24:00` e `operatingDays` para esses registros. Os deployments anteriores são API `9944fe39-b009-4371-8bf6-5742bf57c687` e web `ad4c9880-96b3-40f5-9c11-17cb7c19e377`; não reverta a semântica da agenda nem remova seus campos sem uma correção direcionada. Prefira corrigir para frente e preservar os cadastros e a auditoria.
