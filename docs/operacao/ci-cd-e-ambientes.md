# Estratégia de CI/CD e ambientes

## Objetivos

- produzir uma vez e promover o mesmo artefato;
- impedir deploy com teste, migration ou secret inválido;
- isolar dados e credenciais entre ambientes;
- implantar API e frontend de forma independente;
- oferecer rollback de aplicação sem depender de rollback destrutivo do banco;
- preparar PWA e pacotes mobile rastreáveis.

## Fluxo de branches e releases

Usar desenvolvimento baseado em `main` com branches curtas e pull request. `main` permanece implantável. Tags `vX.Y.Z` identificam releases e imagens/artefatos incluem commit SHA.

- **Pull request:** validação completa, sem deploy Production.
- **Merge em main:** publica artefatos imutáveis e promove automaticamente para Test; Staging pode ser automático após checks.
- **Produção:** promoção manual aprovada do artefato já validado em Staging.
- **Mobile:** workflow manual por versão, com promoção para TestFlight/Google Play Internal Testing antes da loja.

## Pipeline de pull request

1. Checkout com permissões mínimas e dependências travadas.
2. Backend: restore, format check, build com warnings relevantes como erro, unit tests.
3. Banco: subir PostgreSQL efêmero, aplicar migrations do zero, executar integration tests e testar upgrade da baseline suportada.
4. Frontend: install imutável, format/lint, TypeScript, Vitest e build PWA.
5. Contrato: gerar/verificar OpenAPI e cliente; falhar em drift não versionado.
6. End-to-end mínimo com API + PostgreSQL + frontend.
7. Segurança: scan de secrets, dependências e imagem; gerar SBOM quando houver container.
8. Capacitor: validar configuração e sincronização dos projetos quando arquivos mobile forem alterados.

Jobs independentes rodam em paralelo; migrations e integration tests esperam o build necessário. Cache acelera dependências, mas nunca inclui secrets ou diretórios de saída não confiáveis.

## Build e promoção

### API

- imagem OCI multi-stage, runtime sem root e health checks configurados no provedor;
- tag imutável por SHA e versão, com digest registrado;
- migration bundle/runner usa a mesma versão do código;
- API inicia somente quando configuração obrigatória é válida.

### Web/PWA

- artefato estático versionado e servido com headers seguros;
- HTML/service worker sem cache permanente; assets com hash e cache imutável;
- variáveis públicas não contêm secrets;
- CSP, `frame-ancestors`, referrer policy e headers de conteúdo configurados.

### Mobile

- versionCode/build number cresce em cada submissão;
- certificados e chaves ficam no cofre do CI/contas de loja;
- source maps são enviados ao monitoramento com acesso restrito;
- pacote aponta para a API correspondente à trilha.

## Deploy backend e banco

1. Validar backup e janela quando a migration for relevante.
2. Executar migration aditiva por job único, com lock e timeout.
3. Implantar nova API gradualmente quando o provedor permitir.
4. Esperar readiness e executar smoke tests autenticados controlados.
5. Promover frontend compatível.
6. Monitorar erro, latência e saturação; registrar decisão de continuar ou voltar.

Nunca rodar migrations concorrentes em todas as réplicas durante startup. Mudanças destrutivas exigem release posterior depois que nenhuma versão ativa usa a coluna/estrutura antiga.

## Ambientes

| Ambiente | Uso | URLs | Dados | Deploy |
|---|---|---|---|---|
| Development | desenvolvimento local | web `http://localhost:5173`; API `https://localhost:7xxx` | PostgreSQL local, seed sintético | manual por compose/scripts |
| Test | CI e testes automatizados | efêmeras/internas | PostgreSQL efêmero por execução | criado e destruído pelo pipeline |
| Staging | homologação e ensaio | domínios técnicos exclusivos `*.up.railway.app`; domínios próprios somente após aprovação | banco próprio; cópias somente com proteção/autorização | promoção de `main` após CI |
| Production | operação real | `longbeach.quebranunca.com.br`; `api.longbeach.quebranunca.com.br` | banco próprio, backups e retenção formal | promoção manual do artefato de Staging |

Cada ambiente tem banco, usuário de banco, secrets, storage bucket/prefix, chaves JWT, CORS, push, e-mail, logs, métricas e alertas próprios. Não compartilhar conexão, chave de assinatura ou credencial de provider entre ambientes.

## Configuração obrigatória

Categorias, com nomes concretos definidos pelo código:

- conexão PostgreSQL e timeout;
- issuer, audience e material de assinatura JWT;
- pepper/segredo quando o desenho de tokens exigir;
- origens CORS, origens nativas permitidas (`capacitor://localhost` e `https://localhost`) e URL pública web/API;
- domínio do cookie anti-CSRF web (`Authentication__CookieDomain`), sem ampliar o domínio do cookie de refresh;
- storage endpoint/bucket/credenciais;
- provedores de e-mail e push;
- OpenTelemetry/log sink;
- timezone operacional;
- feature flags próprias do Long Beach.

Development pode usar secret store local; CI e ambientes hospedados usam cofre/variáveis protegidas do provedor. O pipeline referencia secrets por nome e não os imprime.

No IaC Railway, valores não secretos e estáveis ficam explícitos para permitir revisão e detectar drift; somente secrets, PII de bootstrap, conexões gerenciadas e valores gerados pelo provedor usam `preserve()`. Antes de cada build web e corte, comparar o snapshot com as variáveis live de CookieDomain, issuer JWT, origens CORS e `VITE_API_URL`. CORS é específico da fase: preview apenas antes do corte, origem oficial apenas depois que o legado sair do domínio.

## Estratégia de recursos hospedados

O provedor pode ser Railway enquanto atender aos requisitos, desde que o novo produto tenha projeto/serviços, PostgreSQL, volume/storage, variáveis e logs próprios. O workspace do fornecedor pode ser o mesmo por conveniência administrativa; os recursos e permissões de runtime não são compartilhados com a Plataforma QuebraNunca nem com o serviço legado.

O procedimento concreto de Production está em [`deploy-railway-production.md`](deploy-railway-production.md). Web e API são validados primeiro nos domínios técnicos do Railway. O domínio web oficial só é transferido do serviço legado ao standalone depois dos critérios de go/no-go, com retorno ensaiado.

Estrutura mínima:

- serviço `longbeach-api`;
- serviço/static hosting `longbeach-web`;
- PostgreSQL exclusivo;
- job de migrations;
- object storage exclusivo;
- observabilidade e alertas com destino próprio.

O dashboard Node/SQLite atual permanece em serviço separado durante a transição.

## Smoke tests por ambiente hospedado

- DNS/TLS e headers básicos;
- `/health/live` e `/health/ready`;
- login com conta sintética/operacional controlada;
- refresh e logout;
- autorização negada para uma permissão crítica;
- leitura e escrita reversível de um registro de smoke isolado;
- auditoria correspondente;
- versão frontend/API esperada.

## Rollback

- **API:** reimplantar digest anterior compatível com o schema atual.
- **Web:** promover artefato estático anterior e invalidar apenas HTML/service worker.
- **Migration:** preferir correção forward; restauração de banco é último recurso e exige preservar transações ocorridas depois do backup.
- **Legado preservado:** antes do corte, restaurar apenas a revisão standalone. Depois da transferência do domínio web, o rollback também reassocia `longbeach.quebranunca.com.br` ao serviço legado preservado pelo procedimento ensaiado.
- **Mobile:** não há rollback instantâneo em lojas; usar compatibilidade de API, feature flag e hotfix submetido. Nunca exigir atualização imediata sem política explícita.

## Aprovações e proteção

- Production exige environment protection e responsável autorizado.
- Pull request não recebe secrets de Production.
- Migration, alteração de papel baseline, política de retenção e domínio exigem revisão adicional.
- Deploy registra autor, commit, digest, migration, horário e resultado do smoke test.
