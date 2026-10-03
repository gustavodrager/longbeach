# Critérios de pronto

## Definição de pronto para uma mudança

Uma história, correção ou tarefa de código só está pronta quando os itens aplicáveis abaixo foram atendidos.

### Produto e comportamento

- Critérios de aceite foram demonstrados no perfil e viewport relevantes.
- Estados de carregamento, vazio, sucesso, erro, falta de permissão e sessão expirada foram considerados.
- Texto visível está em português claro e não expõe detalhes de implementação.
- Fluxos alterados preservam o comportamento útil do legado ou documentam a mudança aprovada.

### Arquitetura

- A mudança respeita o ADR-001 e funciona sem a Plataforma QuebraNunca.
- Dependências entre camadas e limites de módulo estão corretos.
- Contratos públicos/OpenAPI foram atualizados sem vazar entidades de persistência.
- Nova decisão duradoura ou exceção tem ADR.

### Segurança e privacidade

- Autenticação e autorização foram verificadas no servidor com teste permitido/negado.
- Inputs, uploads, paginação e limites foram validados.
- Secrets, tokens, senhas e dados pessoais não aparecem em código, logs, fixtures ou screenshots.
- A operação crítica produz auditoria adequada e não grava payload sensível desnecessário.
- Dependências novas foram justificadas e verificadas pelo pipeline.

### Dados

- Migration EF Core é aditiva ou segue expand-and-contract e aplica em banco vazio e banco na versão anterior.
- Rollback de aplicação e compatibilidade de schema foram avaliados.
- Escritas repetíveis têm idempotência; concorrência tem regra explícita.
- Horário UTC/timezone, valores monetários e arredondamento possuem testes quando aplicáveis.
- Importação informa origem, lote, totais e conflitos.

### Qualidade

- Código formatado; lint e typecheck passam.
- Build backend, web/PWA e, quando afetado, sincronização Capacitor passam.
- Testes unitários, integração e end-to-end proporcionais ao risco passam.
- Acessibilidade por teclado, nome acessível e contraste foram verificados para UI alterada.
- Não há warning novo ignorado sem justificativa.

### Operação

- Configuração e secrets necessários estão definidos por ambiente sem valor versionado.
- Logs, métricas, alertas e health checks cobrem nova dependência ou caminho crítico.
- Runbook e documentação foram atualizados.
- Deploy gera artefato imutável e smoke test; caminho de retorno é conhecido.

## Pronto para Staging

- Todos os checks de pull request estão verdes.
- Migrations foram executadas num PostgreSQL efêmero desde zero e por upgrade.
- Artefatos exibem versão/commit e não são reconstruídos durante a promoção.
- Secrets e URLs pertencem a Staging.
- Dados de teste são sintéticos ou protegidos.
- Smoke tests de login, readiness e fluxo alterado passam no endereço de Staging.
- Mudança de schema, permissão ou operação tem roteiro de validação.

## Pronto para Production

- Staging foi aceito por responsável do produto.
- Backup recente existe e restauração foi testada conforme o runbook.
- Migration foi revisada, estimada e é compatível com a versão anterior da aplicação durante a janela.
- Alertas, responsável de plantão e critérios de rollback estão definidos.
- Nenhuma credencial de Development/Test/Staging está presente.
- Domínios, TLS, CORS, issuer e audience apontam para Production.
- Smoke tests pós-deploy e reconciliação foram preparados antes do corte.
- Para migração do legado, o sistema anterior permanece disponível e o delta final foi reconciliado.

## Pronto para release mobile

- Build web que originou o pacote está identificado pelo commit/release.
- iOS e Android usam IDs, ícones, nomes e endpoints do ambiente correto.
- Login, refresh, logout, secure storage, deep links, conectividade e atualização foram testados em dispositivo real.
- Política de privacidade, termos, suporte e exclusão de conta estão publicados.
- Data safety/privacy labels refletem SDKs e comportamento real.
- Screenshots, descrição, classificação etária e credenciais de revisão estão atualizadas.
- TestFlight/Internal Testing ou trilha equivalente concluiu o roteiro de aceite.

## Pronto para encerrar uma migração

- Contagens e totais de origem/destino conferem ou diferenças estão aprovadas.
- Relatório de rejeitados e possíveis duplicatas tem responsável.
- Reprocessar o lote não duplica dados.
- Identificadores de origem e audit trail permitem rastrear cada registro.
- A fonte antiga está somente leitura, arquivada ou ainda disponível conforme a janela de rollback.
- Desativação recebeu aceite explícito; nenhum recurso foi apagado apenas por “parecer sem uso”.
