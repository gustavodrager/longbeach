# Deploy de Production no Railway

## Escopo e isolamento

Este runbook publica a base standalone em recursos exclusivos do projeto Railway `longbeach-os`:

- web oficial: `https://longbeach.quebranunca.com.br`;
- API oficial: `https://api.longbeach.quebranunca.com.br`;
- PostgreSQL: serviço `Postgres` privado do projeto;
- serviços: `api` e `web`.

A conta Railway e o namespace DNS `quebranunca.com.br` são compartilhados somente como infraestrutura administrativa. O projeto, os serviços, banco, usuários, autenticação, migrations, variáveis, secrets, logs, backups e deploy do Long Beach OS são próprios. Não use referências de serviço, banco, volume, variável ou domínio interno da Plataforma QuebraNunca nem do projeto legado.

O endereço `longbeach.quebranunca.com.br` atende hoje o Long Beach OS standalone no serviço `web`; a API usa `api.longbeach.quebranunca.com.br`. O serviço Node/SQLite legado permanece preservado em seu projeto e endereço técnico Railway para consulta e retorno. Não haverá registro de `longbeach.com.br`, nova zona DNS nem nova conta Cloudflare.

A infraestrutura Railway é descrita em `.railway/railway.ts` como **snapshot declarativo da fase corrente**, e não como desenho atemporal do estado final. O snapshot corrente registra `api.longbeach.quebranunca.com.br` no serviço `api` e `longbeach.quebranunca.com.br` no serviço `web`. A promoção UX de 2026-10-05 vincula somente os serviços oficiais à revisão validada `codex/ux-identidade-global-20261005` no mesmo repositório; os serviços auxiliares conservam sua fonte anterior. O binding de `preview.longbeach.quebranunca.com.br` foi removido em 2026-10-05; mantenha os domínios técnicos Railway para health check e retorno.

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

O último `railway config pull` foi revisado e `railway config plan` ficou sem drift. A API e a web concluíram o deploy com sucesso; readiness da API e health check da web responderam `200`. A tela `/importacoes` confirmou dois lotes no PostgreSQL, ambos `NeedsReview`: `fonte-0.xlsx` (80 linhas) e `fonte-1.xlsx` (1.031 linhas). Os dados continuam em staging e nenhuma linha foi aplicada aos cadastros.

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
