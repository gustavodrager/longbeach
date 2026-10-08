# Deploy de Production no Railway

## Correção PagBank e publicação após envio da homologação — 2026-10-08

Publicação autorizada pelo proprietário na conversa operacional. PR [#20](https://github.com/gustavodrager/longbeach/pull/20) integrado em `codex/saldos-pagina-inicial`; API e web fixadas no artefato validado `99f81448b83a4d54e725d456b00d128db92c61cc`, branch `codex/pagbank-homologacao-20261007`. A correção inclui os itens exigidos pelo PagBank no pedido de cartão. Nenhuma migration nova nesta revisão.

- API: `736e0d80-f7a7-43a3-a740-5a3437771cd0`, `SUCCESS` às 12:18 UTC; digest `sha256:1262422f1ab30329952a1c019157ecba68023fbc252be0f9e160a9f4f284bc8f`.
- Web: `435ccc54-8324-4ac7-a2f5-e04fee425c1f`, `SUCCESS` às 12:31 UTC; digest `sha256:e9c9735d2fbd6b1ec73876618acf4494f474bdf6016becfbc5158422a6dd108f`.
- CI [37715620674](https://github.com/gustavodrager/longbeach/actions/runs/37715620674) aprovado: 163 testes unitários, 213 de integração PostgreSQL e 208 frontend (584 testes da aplicação), além de conversores e builds.
- API publicada e validada antes da web. `/health/live`, `/health/ready`, `/` e `/healthz` responderam `200`; endpoints de contas pessoais, contas administrativas, integrações e documentos EDI responderam `401` sem sessão. CORS autorizou a origem oficial com credenciais e não autorizou o preview.
- No navegador autenticado, a atualização da PWA preservou a sessão; dashboard e Recebimentos carregaram. A conferência visual mostrou Conta do Bar e Conta da Quadra, ambas sem contas vinculadas na seleção. Nenhuma cobrança, pagamento ou alteração de dados financeiros foi realizada nesse smoke.
- Cada patch mudou somente branch e commit do serviço oficial correspondente. Snapshots importados e registrados por etapa; planos sem diferenças. Os seis serviços ficaram online, sem falhas recentes nem trabalho pendente. Variáveis, domínios, banco, volumes e serviços auxiliares foram preservados.

Antes desta publicação, a API já tinha `Integrations__PagBankEdi__Enabled=true`, USER e token EDI cadastrados. O snapshot passou a preservar essas três variáveis, sem versionar seus valores. Isso atualiza o diagnóstico da entrega de 2026-10-07: a coleta está habilitada na configuração, mas sua execução e conciliação reais não foram validadas nesta publicação.

As flags de novas cobranças, PagBank, cartão integrado e assinaturas continuam ausentes e desabilitadas pelos padrões da aplicação. O envio do formulário de homologação foi confirmado pelo Pipefy na etapa anterior; aprovação do PagBank ainda não comprovada. Publicar esta versão não habilita recebimentos reais nem encerra as pendências de homologação.

Rollback compatível da aplicação: API `79e9d4dd-2f45-4905-8ecc-2e6946cac81f` e web `adda5137-5604-4aa4-bf93-59462cba4e02`, em `a9b615a5cb4a9269c0ce7c6bf81d5ebdd0e76e60`. Preserve dados, credenciais e configuração EDI existentes. Após reversão, reconcilie a fonte fixada no snapshot e confirme plano sem diferenças.

## Separação de despesas fixas e variáveis — 2026-10-07

API e web promovidas no artefato `4c220504315031587e38fb9d07d148fa6c36e44f`, branch `codex/saldos-pagina-inicial`, após CI [37565416405](https://github.com/gustavodrager/longbeach/actions/runs/37565416405) aprovado: 162 testes unitários, 208 de integração PostgreSQL e 205 frontend, conversores e builds. Nenhuma migration ou alteração de dados nesta entrega.

- API: `d5414e99-04d2-42e5-ace0-6ed901e40695`, SUCCESS, readiness `Healthy`.
- Web: `020b841f-19aa-4f9a-96dd-d60d0a278fc0`, SUCCESS, health `ok`.
- Patches revisados alteraram apenas branch e commit do serviço esperado, primeiro API e depois web. Configurações públicas, snapshots e planos sem diferenças conferidos. Serviços auxiliares preservados.
- Prévia com dados fictícios: lista filtrada, edição/salvamento e retorno preservando o grupo, navegação por teclado com foco visível, sem rolagem horizontal em 360, 390, 768 e 1440 px. Console do fluxo sem erros.
- Produção autenticada: PWA atualizado pelo aviso; quatro totais do dashboard conferidos contra os grupos do controle mensal, incluindo despesa com valor zero. Links de fixas, variáveis, parcelas e acertos mostraram somente as classificações esperadas. Totais e resultado mensal preservados. Nenhuma movimentação real criada durante a validação. Evidência visual privada mantida fora do Git.

Rollback compatível: artefato anterior `12281ec8a29f2fff1bf6dee7b0104393129e85f1`, branch `codex/longbeach-payments`, API `d61045f2-4e33-495f-a703-a654a35cb429` e web `023e0ca8-cb91-473c-9bb9-488858422403`. O novo campo de leitura é opcional, sem mudança de gravação ou schema. Preservar migrations e dados de pagamentos já existentes.

## Pagamentos e área do cliente — 2026-10-06

Publicação autorizada pelo proprietário nesta sessão. PR #15 aplicado em `codex/saldos-pagina-inicial` (merge `106da34b01453da88dcdb6b04a5b8cee2a92b4ba`). API e web fixadas na revisão validada `12281ec8a29f2fff1bf6dee7b0104393129e85f1`, branch `codex/longbeach-payments`. A revisão inclui o portal do PR #16 e preserva o controle mensal integrado durante a preparação; o conflito do menu foi conciliado mantendo Recebimentos e Controle mensal.

CI [37530868604](https://github.com/gustavodrager/longbeach/actions/runs/37530868604) aprovado: 161 testes unitários, 208 de integração PostgreSQL e 200 da interface, além dos conversores e builds. API publicada primeiro, deployment `d61045f2-4e33-495f-a703-a654a35cb429`; web depois, `023e0ca8-cb91-473c-9bb9-488858422403`. Ambos terminaram `SUCCESS`. Cada patch de Production foi revisado antes da aplicação e alterou somente a fonte do serviço correspondente.

O pre-deploy único aplicou `20261006194848_UnifiedBilling` e `20261006195814_BillingProviderOrders`, com confirmação de sucesso nos logs às 21:07 UTC. Readiness/liveness da API e health da web responderam 200; endpoints de contas exigiram autenticação (401 sem sessão). CORS permitiu a origem oficial com credenciais e não permitiu a antiga origem de preview. Fonte oficial da web, PostgreSQL, modo demo desabilitado e configurações públicas de autenticação foram conferidos. Snapshots foram importados e registrados por etapa; planos sem diferenças e nenhum patch pendente ao final.

Nenhuma variável de credencial ou habilitação PagBank está configurada na API. Novos pagamentos pela área de contas, crédito integrado, recorrência e EDI permanecem desabilitados pelos padrões da aplicação. Publicar as telas não comprova homologação nem libera recebimentos reais. Configuração, habilitação e teste real seguem [pagamentos unificados](../bar/pagamentos-unificados.md). Não foram criados vínculos de alunos por inferência, cobranças de teste ou movimentações financeiras em produção.

A revisão visual e o smoke autenticado desta sessão não foram realizados: o navegador recusou acesso porque não conseguiu verificar a política de segurança administrativa. As verificações acima são de CI, configuração, logs e endpoints públicos; não equivalem ao aceite visual ou à homologação com clientes.

Rollback de aplicação: API anterior `16af4d6f-fadd-4189-b17d-5c5bde8f751c` e web anterior `9c0ccfac-b34e-4970-b20c-58b85b7aedd6`, ambas em `08e3e9c96b3542d3b48c182b161e38c972a5ba57`. Preservar as migrations e os registros financeiros. Depois de iniciar pagamentos reais, preferir desligar novas operações e manter consulta/recuperação na versão compatível; não reverter o banco. Serviços auxiliares, domínios e legado permaneceram inalterados.

## Consolidado mensal conciliado e referência de compras — 2026-10-06

API e web fixadas em `ba08ce8fc7457de13152410faa5a4852da93b1ff`, branch `codex/saldos-pagina-inicial`. CI `37513023940` aprovado: 139 testes unitários, 164 de integração PostgreSQL, 178 frontend, 11 de conversores e builds API/PWA. Nenhuma migration nova.

API `afe4dc01-19b4-435a-90f7-ec27b999fac2` publicada primeiro, web `aacd2efb-f84b-497a-ae38-96f377798f83` depois, ambas `SUCCESS`; health checks responderam `Healthy`/`ok`. Fonte oficial, armazenamento PostgreSQL e modo demo desabilitado conferidos. Cada patch alterou apenas o commit do serviço esperado; snapshots sincronizados e planos sem diferenças. O snapshot final deduplicou a fonte comum de API/web; os serviços auxiliares conservam a fonte anterior.

Em produção, o pacote explicitamente conciliado do mês foi aplicado com dois totais e releitura de zero novos/dois existentes. O Chrome confirmou déficit, receitas, despesas e fonte PDF do saldo bancário independentemente, depois de atualizar a PWA. A compra autorizada e o recebimento foram registrados pelo fluxo normal, com uma única despesa operacional e referência do proprietário que adiantou recursos. Não foi efetuado pagamento ou compensação. Arquivos, valores, identidades e evidências ficam em armazenamento local privado.

A ficha de compra exibe fornecedor, data, forma informada, referência de acerto e quantidades recebidas. Conferida em 360, 390, 768 e 1440 px, sem rolagem horizontal da página. As verificações após publicação foram de leitura, separadas das importações e registros reais autorizados.

Rollback disponível: API `80d655a8-831c-4247-aea0-2f8eca1e2cdb` (`b29dfbd`) e web `e386c019-7e3d-4e77-b413-42139ba220b3` (`b1442f4`). Preserve os dados aplicados. A API anterior não calcula o novo modelo de consolidado com receita total: retorna indisponibilidade em vez de somar valores incorretos. Prefira manter a API atual e corrigir para frente; uma reversão só da interface preserva os registros, mas oculta a referência de quem pagou na listagem de compras.

## Promoção de saldos e acesso Google — 2026-10-06

Runtime de API e web fixado em `ee43f5cf4e7f414af8e82cf32e69940ad01813f7`, branch `codex/saldos-pagina-inicial`. CI `37473848182` aprovado (backend, conversores e frontend). API publicada primeiro, web depois. Health checks oficiais responderam normalmente e os cartões, períodos, despesas positivas e origem dos registros foram conferidos no Chrome.

Dois usuários individuais pendentes receberam os e-mails explicitamente autorizados pelo proprietário por `--authorize-google-access --provision-from-stdin`. O pre-deploy temporário executou migration e os dois comandos em sequência; os logs confirmaram duas alterações, preservação de papel e desativação da credencial inicial. Nenhuma conta foi criada. Os dois parâmetros temporários foram removidos após sucesso e o pre-deploy voltou a `--migrate-only`. Os e-mails permanecem na allowlist privada, sem PII em Git. O primeiro login pessoal de cada proprietário deve ser feito por ele no Google.

Deploy inicial da API: `0c224e7d-445f-4e07-8ff9-f375ab36ee18`; API após retirada dos parâmetros: `629d709b-2ecd-4796-99d3-55fb1e069d4e`; web: `534b4425-adde-41b5-b43a-ba5ef1a170e2`. Snapshots registrados por etapa e planos sem alterações. Não houve mudança nos serviços auxiliares, domínios ou acesso privado ao PostgreSQL.

Extrato classificado de setembro aplicado pelo fluxo de staging/conferência/auditoria: 152 movimentos bancários e duas despesas externas confirmadas, com releitura indicando zero novos e 154 existentes. Arquivo, totais e comprovantes da conferência permanecem em armazenamento local privado. O extrato não informa saldo inicial/final nem substitui o consolidado completo da arena.

EDI continua aguardando USER/token próprios e primeira coleta real. O coletor está disponível no servidor, porém a ausência de credenciais não representa sincronização ativa. PagVendas mantém importação por exportações oficiais; API administrativa ainda não confirmada.

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


## Grade atual de aulas — 2026-10-06

Publicação autorizada na conversa operacional, isolada no projeto Long Beach OS. API e web foram fixadas em `778c580517bc1240d7499ac95366f4c7dfa9805f`, branch `codex/grade-aulas-atual`, após CI `37457110200` aprovado. PR de revisão: https://github.com/gustavodrager/longbeach/pull/12.

- API: deployment `bb0ce23b-07cf-4cc5-9f46-0e310179775f`, SUCCESS; `/health/ready` respondeu `Healthy`.
- Web: deployment `60877a90-93a7-4b78-b378-ddc17239bd36`, SUCCESS; `/healthz` respondeu `ok`.
- As duas alterações de fonte passaram por revisão do patch; nenhuma variável, domínio, volume, banco ou serviço auxiliar foi alterado. Snapshots foram reconciliados após cada mudança; plano final `No changes.`.
- Validação local: 130 testes unitários, 156 de integração PostgreSQL e 157 frontend; builds .NET e PWA aprovados. O CI também concluiu backend e frontend com sucesso.
- Depois de atualizar a PWA no navegador autenticado, um lote conciliado criou 1 professor, 6 turmas e 29 matrículas, vinculando 24 alunos existentes. A sexta-feira ficou com uma única turma 17h–18h, capacidade 6, ocupação 6/6. A gestão confirmou o professor atual e a modalidade; dados pessoais e pacotes ficam fora do Git.
- Escola, detalhe da sexta, Agenda e dashboard foram conferidos na produção. O dashboard mostrou 6 turmas, 6 horas semanais, 29/36 vagas ocupadas, 7 vagas livres e 24 alunos únicos. Equipe mostrou acordo financeiro a combinar, sem registrar zero ou gerar despesas.
- A origem original e os pacotes rejeitados na conferência permanecem preservados; somente o lote conciliado foi aplicado. Nenhuma reserva, cobrança ou presença foi criada. A agenda completa da quadra continua pendente enquanto os aluguéis e bloqueios atuais não forem confirmados.

Procedimento e limites de reversão: [Importação da grade de aulas](importacao-grade-aulas.md). Não voltar a versões que desconhecem valores financeiros nulos ou início de grade após aplicar os registros.

## Preparação operacional do EDI — 2026-10-07

API e web promovidas, nessa ordem, para `a9b615a5cb4a9269c0ce7c6bf81d5ebdd0e76e60`, branch `codex/edi-operacao-20261007`. A publicação foi autorizada na conversa operacional. PR de implementação: https://github.com/gustavodrager/longbeach/pull/18, integrado à branch de trabalho `codex/saldos-pagina-inicial`.

- API: `5612a486-33a5-4b5f-b50c-0f56703a1f71`, `SUCCESS`; `/health/live` e `/health/ready` responderam `200 Healthy`. O pre-deploy controlado confirmou banco atualizado, sem novas migrations.
- Web: `adda5137-5604-4aa4-bf93-59462cba4e02`, `SUCCESS`; `/` e `/healthz` responderam `200`. Os dois serviços permanecem fixados no commit validado.
- CI `37695242404` aprovado: 162 testes unitários, 213 de integração PostgreSQL e 208 frontend (583 testes da aplicação), além de conversores e builds. Inclui falha após dia concluído, timeout no corpo, repetição idempotente, autorização, auditoria, versão substituída e concorrência com conciliação.
- Consulta de integrações, documentos EDI e POST de reconsulta retornaram `401` sem sessão. A origem oficial recebeu CORS com credenciais; a origem de preview não recebeu permissão. A conferência visual autenticada não foi repetida nesta promoção; não considerar o smoke HTTP como prova desse fluxo.
- Somente branch/commit dos serviços oficiais foram alterados. Snapshots foram registrados após cada promoção, com plano sem diferenças. Variáveis, serviços auxiliares, domínios e volumes foram preservados.

O responsável confirmou que recebeu USER e token EDI no portal PagBank. Na conferência final, o serviço `api` ainda não tinha variáveis EDI; o coletor continua desabilitado por padrão. Nenhuma consulta real ao EDI foi executada nesta entrega. A ativação depende de cadastro seguro das credenciais e confirmação da data inicial, seguidos da primeira coleta e comparação com o extrato oficial. Não registrar credenciais, documentos reais nem dados pessoais neste runbook. Procedimento: [Histórico financeiro e integrações](../arquitetura/historico-financeiro-integracoes.md#pagbank-edi).

Rollback da aplicação: API `d5414e99-04d2-42e5-ace0-6ed901e40695` e web `020b841f-19aa-4f9a-96dd-d60d0a278fc0`, ambas em `4c220504315031587e38fb9d07d148fa6c36e44f`. Preserve documentos, versões e cursores; se o EDI já tiver sido ativado, desabilite a coleta antes de retornar ao coletor anterior. Depois, registre novamente as fontes fixadas e confirme plano sem diferenças.
