# Integração de estoque e materiais — 27/10/2026

Implementação local autorizada na sequência proteção do Bar → movimentações de materiais, na branch `codex/estoque-materiais-20261027`. O código publicado registrado continua em `7179c9f`; esta implementação ainda não foi publicada.

## Entrega

- Bar: regra de integridade de unidade/controle de estoque recuperada seletivamente, com concorrência e snapshots atuais; categorias, código automático e fluxo moderno preservados.
- Materiais: movimentos tipados, histórico imutável, idempotência, versão esperada, permissões e custos protegidos, integrados à interface atual.
- Schema: migration aditiva nova `20261027135728_MaterialStockLedger`, mantendo as 27 anteriores intactas.
- Originais: nenhuma alteração nas pastas arquivadas; não foi reintroduzido o ajuste antigo do Bar nem os fluxos bancários/fiscais superados.

O [ADR-017](../adr/ADR-017-integridade-estoque-e-materiais.md) registra as decisões; o [guia de materiais](materiais-consumo.md) descreve a operação.

## Validação

A etapa do Bar passou em 375 testes de integração distintos em PostgreSQL17, incluindo oito casos novos. Uma rodada inicial recusou nove casos pelo nome do banco descartável; eles foram repetidos com o nome exigido e passaram, sem relaxar a guarda. Os 12 casos dirigidos também passaram. Build Release sem erros ou avisos.

A regressão final passou sem falhas ou testes ignorados:

| Verificação | Resultado |
| --- | --- |
| Backend unitário | 493 testes |
| Backend integração, PostgreSQL 17 | 388 testes |
| Backend integração, PostgreSQL 18 | Os mesmos 388 testes, executados novamente |
| Frontend completo | 572 testes em 59 arquivos |
| Guarda de schema do launcher | 4 testes |
| Build Release da solução/API | Sem erros ou avisos |
| TypeScript e build de produção/PWA | Aprovados |

São 1.453 testes distintos da aplicação, mais quatro da guarda local. A suíte final inclui os oito casos novos do Bar, 21 casos unitários de materiais, 13 integrações de materiais e 18 casos novos de interface. A revisão final independente não encontrou bloqueadores. Foram conferidos os hashes dos sete arquivos da etapa do Bar e os arquivos das 27 migrations anteriores; permaneceram intactos durante a integração de materiais.

Evidências privadas em `LongBeach/evidencias/integracao-estoque-materiais-2026-10-27/`, fora do Git: relatórios TRX, logs, recibo da etapa Bar, `resultado.json` e `previa.json`. O recibo identifica os hashes do código e dos artefatos usados. O build frontend foi conferido na execução do agente responsável; não foi gerado um log separado.

## Prévia local e retorno

A autorização anterior para atualizar a prévia com backup foi aplicada somente a `longbeach_profiles_preview`, no contêiner local `longbeach-perfis-test`, porta loopback 55439. Identidade, schema e ausência de outras conexões foram conferidos antes da operação.

O backup custom privado, com permissão 0600 e SHA-256, foi restaurado em PostgreSQL 17 descartável. As contagens e hashes das 59 tabelas anteriores, os 27 IDs de migrations e o estado da sequência conferiram. O upgrade 27→28 foi ensaiado nesse clone: os dados anteriores permaneceram idênticos e o ledger novo ficou vazio.

Antes de aplicar, o backup, a fonte e os artefatos foram conferidos novamente. A mesma migration ensaiada foi então aplicada à prévia. A comparação posterior confirmou as 59 tabelas e a sequência preservadas, 28 migrations e nenhum comprovante fabricado. A guarda do launcher confirmou o alinhamento. Os dois contêineres descartáveis dos testes/ensaio foram removidos; a prévia e o backup foram preservados.

O caminho e o hash exatos do dump constam de `previa.json`; o arquivo está em `LongBeach/dados-locais/backups/`. O helper privado `atualizar-previa.py` é o registro de uma execução pontual; não deve ser repetido como rotina administrativa. O retorno deve seguir estas etapas:

1. Encerrar os escritores locais e preservar também um backup do estado atual, com todos os comprovantes posteriores.
2. Conferir o dump anterior pelo hash de `previa.json` e restaurá-lo primeiro em banco isolado; repetir as comparações registradas no recibo.
3. Revisar os dados posteriores antes de qualquer substituição da prévia. O backup anterior não contém lançamentos feitos depois desta atualização.
4. Manter a aplicação antiga sem acesso de escrita ao saldo enquanto existir o ledger novo. Não executar `Down` para apagar comprovantes. O retorno da aplicação e o retorno dos dados exigem revisão conjunta, conforme o [ADR-017](../adr/ADR-017-integridade-estoque-e-materiais.md).

Os comprovantes históricos de `evidencias/outputs/` e seu procedimento de retorno não foram alterados.

## Limites

O checkpoint de solicitação da interface é mantido em memória por sessão/identidade. Recarregar completamente exige consultar saldo e histórico antes de criar outra operação. Materiais com unidade antiga ausente e saldo/histórico não recebem unidade inferida. A atualização não declara saldos conciliados e não implementa patrimônio individual, empréstimos ou compras da Arena.

Não houve deploy, alteração de DNS, migration de produção ou modificação de recursos hospedados.
