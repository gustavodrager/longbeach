# Deploy de Production no Railway

## Escopo e isolamento

Este runbook publica a base standalone em recursos exclusivos do projeto Railway `longbeach-os`:

- web oficial: `https://longbeach.quebranunca.com.br`;
- API oficial: `https://api.longbeach.quebranunca.com.br`;
- PostgreSQL: serviço `Postgres` privado do projeto;
- serviços: `api` e `web`.

A conta Railway e o namespace DNS `quebranunca.com.br` são compartilhados somente como infraestrutura administrativa. O projeto, os serviços, banco, usuários, autenticação, migrations, variáveis, secrets, logs, backups e deploy do Long Beach OS são próprios. Não use referências de serviço, banco, volume, variável ou domínio interno da Plataforma QuebraNunca nem do projeto legado.

O serviço Node/SQLite legado atende hoje `longbeach.quebranunca.com.br`. Antes de transferir esse domínio, preserve o serviço, volume, dados e credenciais e valide seu domínio técnico Railway. A nova web e a API são testadas primeiro pelos domínios técnicos do projeto standalone. Não haverá registro de `longbeach.com.br`, nova zona DNS nem nova conta Cloudflare.

A infraestrutura Railway é descrita em `.railway/railway.ts` como **snapshot declarativo da fase corrente**, e não como desenho atemporal do estado final. Na fase atual, o snapshot registra a API no domínio oficial `api.longbeach.quebranunca.com.br` e a web no domínio temporário `preview.longbeach.quebranunca.com.br`. Depois do corte, o domínio de preview deve ser substituído no IaC por `longbeach.quebranunca.com.br`; os dois não permanecem juntos.

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

| Serviço | Variável | Valor exigido antes do corte |
|---|---|---|
| `api` | `Authentication__CookieDomain` | `longbeach.quebranunca.com.br` |
| `api` | `Authentication__Jwt__Issuer` | `https://api.longbeach.quebranunca.com.br` |
| `api` | `AllowedHosts` | `api.longbeach.quebranunca.com.br;<api-tecnica>.up.railway.app;healthcheck.railway.app` |
| `api` | `Cors__AllowedOrigins__0` | `https://preview.longbeach.quebranunca.com.br` |
| `api` | demais `Cors__AllowedOrigins__*` | ausentes, salvo host Railway controlado e justificado para smoke |
| `api` | `ReverseProxy__TrustAllForwarders` | `false` |
| `web` | `VITE_API_URL` | `https://api.longbeach.quebranunca.com.br` |

Falhe o build ou corte se o valor live, o snapshot e esta tabela divergirem. Depois do corte, a origem CORS exigida muda atomicamente para `https://longbeach.quebranunca.com.br` e o preview deixa de existir no binding, DNS, CORS e IaC.

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

Cors__AllowedOrigins__0=https://preview.longbeach.quebranunca.com.br
Database__MigrateOnStartup=false
Authorization__SeedOnStartup=false
HealthChecks__DatabaseEnabled=true
ReverseProxy__TrustAllForwarders=false
```

Sele `Authentication__Jwt__SigningKey` no Railway. A chave deve ter pelo menos 32 caracteres e deve ser exclusiva de Production.

Mantenha `healthcheck.railway.app` em `AllowedHosts`: o Railway usa esse host nos probes. A tentativa sem ele deixou a revisão pendente mesmo com o processo saudável. Substitua `<api-tecnica>` pelo host técnico real e não aceite curingas.

Mantenha `ReverseProxy__TrustAllForwarders=false` até existir política validada de proxies/redes confiáveis. Enquanto isso, use os logs HTTP do Railway e correlation IDs para investigação; não trate o endereço observado pela aplicação como IP confiável do cliente. Qualquer ativação futura exige lista de proxies/redes conhecidas, teste de spoofing e nova decisão operacional.

`Authentication__CookieDomain` usa `longbeach.quebranunca.com.br`, o menor domínio comum entre web e API. Não configure `quebranunca.com.br`, pois isso ampliaria o cookie anti-CSRF a outros subdomínios. O refresh token continua em cookie `HttpOnly` restrito ao host da API.

### Barreira de origem durante a coexistência

Antes do corte, **não** permita `https://longbeach.quebranunca.com.br` no CORS nem na validação de `Origin` da API. Esse endereço ainda executa o legado e consegue ler `lb_csrf`, pois o cookie anti-CSRF usa o domínio pai `longbeach.quebranunca.com.br`. Além disso, os hosts são same-site; `SameSite=Lax` não isola subdomínios irmãos e o navegador pode enviar o refresh cookie host-only à API em uma requisição iniciada pelo legado. A combinação de CORS com credenciais e validação explícita de `Origin` é a barreira que impede o legado de obter a resposta autenticada.

Na fase de preview, permita somente `https://preview.longbeach.quebranunca.com.br`. Um host técnico Railway controlado pode ser incluído temporariamente apenas se um smoke realmente depender de CORS; health checks não precisam dessa exceção. Use somente contas de teste/Owner inicial, não acesse o legado no mesmo navegador durante o ensaio e revogue todas as sessões de teste antes do corte.

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

A criação de `Postgres`, `api` e `web` sem domínios customizados foi a fase inicial e já foi concluída. Não a execute novamente. O snapshot corrente deve representar:

- `api`: `api.longbeach.quebranunca.com.br` associado;
- `web`: `preview.longbeach.quebranunca.com.br` associado;
- legado: `longbeach.quebranunca.com.br` ainda associado ao serviço Node/SQLite em seu projeto separado.

Confirme esse estado com `railway config pull`, diff, variáveis live, TLS e health checks. Se o live divergir, pare e reconcilie o snapshot antes de novo build ou domínio.

### Sequência restante antes do corte

1. Validar health checks nos domínios técnicos e em `api.longbeach.quebranunca.com.br`. O `AllowedHosts` temporário deve conter o host técnico real da API.
2. Concluir o bootstrap e seu smoke direto de API; desabilitar o bootstrap, remover seus valores temporários e aplicar nova revisão.
3. Validar pelo preview login web, cookie, recarga/refresh, troca obrigatória da senha inicial e logout. `Cors__AllowedOrigins` contém somente o preview nessa fase.
4. Confirmar que o domínio técnico do legado responde, que seu volume está íntegro e que o procedimento de retorno foi ensaiado.
5. Executar a verificação live de `CookieDomain`, issuer, CORS e `VITE_API_URL`, revisar o build exato a promover e obter go/no-go.

### Troca controlada da web

1. Encerrar/revogar todas as sessões de preview e teste. A troca da senha inicial deve ter revogado as sessões anteriores; finalize também a sessão usada na validação final.
2. Remover `longbeach.quebranunca.com.br` do serviço legado e registrar a mutação no projeto/repositório que o administra.
3. Enquanto o domínio oficial não atende conteúdo legado, alterar a fase standalone de forma coordenada:
   - trocar CORS de `https://preview.longbeach.quebranunca.com.br` para `https://longbeach.quebranunca.com.br`;
   - substituir no IaC o domínio web de preview pelo domínio web oficial;
   - remover o binding e o registro DNS do preview;
   - manter `VITE_API_URL=https://api.longbeach.quebranunca.com.br`.
4. Executar `railway config plan`, revisar e aplicar a mudança de fase.
5. Imediatamente executar `railway config pull`, revisar, fazer commit do snapshot corrente e executar `railway config plan` novamente. O plano final não pode mostrar drift inesperado.
6. Aguardar o certificado web e executar os smoke tests oficiais antes de liberar escrita operacional.

O domínio web não pode ficar associado aos dois serviços. Preserve os alvos, TTL observado, horários, commits e responsáveis. Cada associação ou remoção, inclusive a remoção do preview, exige o ciclo pull/revisão/commit/plan descrito acima.

## Smoke tests

Antes do corte, substitua os placeholders pelos domínios técnicos gerados pelo Railway. Essa etapa prova health e entrega estática; o fluxo de cookies é validado depois pelo preview sob o domínio comum:

```bash
curl --fail --silent --show-error https://<api-tecnica>.up.railway.app/health/live
curl --fail --silent --show-error https://<api-tecnica>.up.railway.app/health/ready
curl --fail --silent --show-error https://<web-tecnica>.up.railway.app/healthz
curl --fail --silent --show-error https://<legado-tecnico>.up.railway.app/health
```

Com a API oficial e o preview configurados:

```bash
curl --fail --silent --show-error https://api.longbeach.quebranunca.com.br/health/ready
curl --fail --silent --show-error https://preview.longbeach.quebranunca.com.br/healthz
```

Depois da transferência:

```bash
curl --fail --silent --show-error https://api.longbeach.quebranunca.com.br/health/live
curl --fail --silent --show-error https://api.longbeach.quebranunca.com.br/health/ready
curl --fail --silent --show-error https://longbeach.quebranunca.com.br/healthz
```

Além das respostas públicas:

- antes do corte, confirmar que a origem preview recebe CORS com credenciais e que `https://longbeach.quebranunca.com.br` não recebe `Access-Control-Allow-Origin` nem passa pela validação de `Origin`;
- confirmar que a tela web carrega sem erro de CORS;
- entrar com o Owner e recarregar a página para provar refresh por cookie;
- trocar a senha inicial no preview, confirmar que as sessões anteriores foram revogadas e que a senha inicial não autentica mais;
- sair e confirmar que a sessão não é restaurada;
- confirmar que a API rejeita `/api/v1/auth/me` sem access token;
- verificar nos logs somente IDs/correlation IDs, sem senha ou token;
- conferir que o bundle web contém `https://api.longbeach.quebranunca.com.br` e nenhuma URL localhost;
- confirmar que o legado continua acessível no domínio técnico preservado.

Depois do corte, repetir a prova CORS no sentido inverso: a origem oficial deve ser a única origem web aceita e o preview não pode existir em CORS, binding ou DNS.

## Rollback

Antes da transferência do domínio web, reverta `api` e `web` para os digests anteriores compatíveis com o schema e mantenha o legado no endereço oficial. Depois da transferência, se migration, readiness, login, CORS, refresh ou fluxo crítico falhar:

1. bloquear novas escritas no standalone e registrar o horário;
2. preservar e exportar as transações já confirmadas;
3. revogar as sessões standalone e remover `https://longbeach.quebranunca.com.br` do CORS e da validação de `Origin`; se essa revisão não puder ser confirmada, desabilitar a API pública;
4. só depois remover `longbeach.quebranunca.com.br` do serviço web standalone e reassociá-lo ao serviço legado preservado;
5. validar TLS/login do legado e confirmar que ele não consegue obter resposta autenticada da API standalone;
6. atualizar o snapshot da fase de rollback, executar `railway config pull`, revisar, fazer commit e exigir `railway config plan` sem drift;
7. restaurar os digests standalone compatíveis e corrigir migrations para frente;
8. reconciliar as transações preservadas antes de tentar novo corte.

Não apague o PostgreSQL, o serviço legado, o volume SQLite ou o D1 durante o rollback. O novo sistema só assume a fonte operacional depois da importação seca, reconciliação, teste de restauração e aceite previstos no plano de transição.
