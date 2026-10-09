# Validação operacional e recuperação

## Agenda e cobranças em produção

Utilizar conexão administrativa já autorizada ou acesso somente leitura; não criar proxy público de banco para esta conferência. Executar `scripts/auditar-operacao.sql` com `psql -X -v ON_ERROR_STOP=1 -v month=2026-10 -f scripts/auditar-operacao.sql`. Configurar a conexão pelo mecanismo seguro já adotado no ambiente, nunca por senha no comando ou no Git.

A consulta usa transação `REPEATABLE READ READ ONLY`, limite de 15 segundos e espera por lock de dois segundos. Retorna contagens agregadas, versão do servidor e estado da coleta EDI. Não retorna nomes, telefones, identificadores de clientes, credenciais ou corpos do provedor. A competência deve ser explícita; não audita todos os meses automaticamente.

Investigar qualquer conflito de agenda, cobrança duplicada, cobrança individual de encontro mensalista, vínculo órfão ou quantidade insuficiente de encontros. Grupos sem competência e competências sem cobrança são **pendências de conferência**, pois o produto permite geração separada e valor a combinar. A comparação de quantidade inclui encontros cancelados e remarcados vinculados à competência original; não recria datas automaticamente. O relatório não substitui conferência dos acordos nem valida saldos bancários.

Registrar data/hora, competência, release, resultado agregado e responsável pela conferência. Guardar evidências com dados reais fora do Git. Nenhum resultado autoriza corrigir ou cobrar clientes automaticamente.

## PagBank e EDI

Novas cobranças integradas permanecem desabilitadas até o aceite. A coleta EDI é independente dos pagamentos. Em 08/10, a consulta de nomes de variáveis no Railway confirmou ausência de `Integrations__PagBankEdi__StartDate`; o worker exige data explícita. Na publicação das 19h21, o log também confirmou falha na validação local de credenciais (`PagBank EDI requires merchant credentials.`): verificar User numérico e Token não vazio por canal seguro. A presença dos nomes das variáveis não comprova valores válidos; não houve evidência de chamada ao provedor nesta inicialização. Confirmar com o proprietário o período antes de habilitar a execução.

Após a configuração controlada, verificar: primeira leitura completa dos quatro movimentos, avanço de `complete_through`, ausência de falha persistente, repetição sem duplicação e conciliação de uma amostra com a fonte. Não concluir sucesso apenas com serviço online. PagBank precisa comprovar aprovação de homologação, retomada de operação incerta, estorno e notificação autenticada; consultar o [runbook de pagamentos](../bar/pagamentos-unificados.md).

## Restauração

O CI usa PostgreSQL 17 e 18. Depois de aplicar migrations e testar readiness, executa auditoria somente leitura e `scripts/verificar-restauracao-ci.sh` dentro do contêiner PostgreSQL descartável. O script rejeita serviço sem `POSTGRES_DB=longbeach_ci` e `POSTGRES_USER=longbeach_ci`, gera backup custom, cria um banco separado e compara contagens e hashes de conteúdo de todas as tabelas públicas, incluindo migrations. Não sobrepõe banco existente nem usa dump de produção.

O resultado desse teste comprova restauração sintética da versão; **não comprova backup ou recuperação dos dados reais**. Para produção, ainda é necessário obter o backup autorizado, restaurar em ambiente isolado sem credenciais externas/coletores ativos, conferir migrations, contagens, integridade e fluxos críticos, medir duração e idade do último dado recuperado e registrar aprovação do responsável. RPO e RTO precisam ser definidos; não há valor presumido.

## Evidências desta rodada

- Railway: seis serviços online, nenhuma alteração pendente e nenhuma falha de implantação nas oito horas consultadas.
- API: tracing Railway desabilitado; outras ferramentas de alertas não foram confirmadas.
- Banco: imagem PostgreSQL 18, volume próprio e nenhum proxy TCP público configurado.
- A consulta administrativa via SSH não pôde iniciar por falta de identidade confiável do servidor no ambiente local. Foi registrada uma chave de acesso temporária em agente isolado; a conexão parou antes de qualquer consulta e a chave foi revogada e apagada. A revisão automática rejeitou aceitar a primeira chave do servidor sem fingerprint verificada. Não foi aberto proxy público. Retomar somente com identidade do servidor confirmada por fonte confiável.
- A auditoria de dados reais e a recuperação de backup de produção permanecem pendentes de acesso e evidência. Nenhum dado operacional foi alterado por esta rodada.

## Promoção anterior de 08/10/2026 às 19h21 (histórico)

A API `47c233f` foi publicada após autorização explícita do proprietário, CI aprovada e revisão do patch limitado à branch e commit da API. Deployment `a26c4f35-eebd-4e98-bf8f-e1b201034e83` concluído com sucesso: `/health/ready` 200, uma réplica online, banco já atualizado e configuração Railway sem divergência. Web e demais serviços preservados. Rollback disponível naquela promoção: API `99f8144`, deployment `736e0d80-f7a7-43a3-a740-5a3437771cd0`, compatível com o mesmo banco.

A conferência da agenda autenticada em produção permanece pendente, pois a inspeção visual está impedida pela verificação de segurança do navegador. A consulta foi validada nos testes de integração; o health check não comprova a reconciliação dos dados reais. Os logs também registram avisos de Data Protection sobre chaves no filesystem efêmero e ausência de encryptor XML; avaliar o uso efetivo de dados protegidos antes de definir persistência, sem confundir esses avisos com falha do deployment.

## Promoção das unidades de negócio — 08/10/2026 às 20h16

Após autorização explícita do proprietário, API e web foram promovidas separadamente ao commit `78f9c81b7b07735289d711ce81fdf8a0c1b6279c`, aprovado na CI `37856181278`. Cada patch foi revisado e continha apenas branch e commit do serviço correspondente. A API foi publicada e verificada antes da web.

- API: deployment `086d5ae7-173d-4029-b052-e218c7770f36`, `/health/ready` 200 às 23:13:58 UTC, pre-deploy sem migrations pendentes.
- Web: deployment `9e93fce3-1a80-4b38-9488-cf1ccc8e495d`, health check Railway `/healthz` aprovado às 23:16:13 UTC.
- Seis serviços online, uma réplica por serviço, nenhum patch pendente e nenhuma falha nas oito horas consultadas. Configuração declarada conferida com `railway config plan --detailed-exit-code`, sem divergência. Digests no manifesto.
- Sem migration nova nem reclassificação de dados em massa. A validação funcional está coberta na CI; a conferência autenticada da interface em produção permanece pendente por bloqueio de segurança do navegador. Os avisos existentes de EDI e Data Protection persistem.

**Reversão:** para interromper a interface nova, retornar a web ao deployment `435ccc54-8324-4ac7-a2f5-e04fee425c1f` (`99f8144`) e manter a API compatível `78f9c81`. A API predecessora `47c233f` não preserva os novos campos omitidos por clientes anteriores. Após qualquer classificação salva, voltar a essa API exige antes interromper escritas e preservar os campos; não usar rollback automático indiscriminado da API. Permissões por unidade, equipe, estoque compartilhado e rateio permanecem fases futuras do ADR-008.

## Publicação da interface de estoque — 09/10/2026 às 12h22

Publicação autorizada explicitamente pelo proprietário do commit `7f47d65cbc12289f2f004c10a94dfb1653d79134`, CI `37858994813` aprovada. O ambiente não tinha alterações pendentes; o patch revisado alterou somente branch e commit do serviço web.

Deployment `07a5e402-516a-44d4-8533-6411c721a579` concluído com sucesso, uma réplica online e health check `/healthz` aprovado às 15:22:23 UTC. Digest e versão registrados no manifesto e fonte web atualizada no snapshot Railway. A API permaneceu no deployment `086d5ae7-173d-4029-b052-e218c7770f36` (`78f9c81`); nenhum job de migration foi acionado. Ambiente sem mudanças pendentes e sem falhas nas oito horas consultadas.

Retorno da web: deployment `9e93fce3-1a80-4b38-9488-cf1ccc8e495d`, commit `78f9c81`; conservar a API atual. A mudança não transferiu nem apagou saldos. Testes de interface e CI comprovam os fluxos; a verificação autenticada no navegador continua pendente pelo bloqueio de segurança administrativo já registrado. Esta publicação não inclui cadastro de produtos: Caipirinha a R$ 25,00 permanece solicitada e ainda não cadastrada por falta de acesso autorizado pelo navegador.
