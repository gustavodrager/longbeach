# Documentação do Long Beach OS

Entrada atual: [estrutura local](operacao/estrutura-local.md), [consolidação de 26/10](operacao/consolidacao-2026-10-26.md), [ADR-016](adr/ADR-016-consolidacao-do-repositorio-local.md) e [operação da VM](operacao/google-vm.md). Os demais registros de implantação são fotografias datadas.

O [guia dos comprovantes e do retorno local](operacao/comprovantes-e-retorno-local.md) registra o arquivamento final de `outputs`, as conferências de integridade e o procedimento ensaiado para restaurar o caminho real.

A [auditoria de atualidade e pendências de 27/10](operacao/auditoria-atualidade-e-pendencias-2026-10-27.md) registra a análise anterior à integração de estoque e materiais e o trabalho útil preservado nas pastas antigas.

A [integração de estoque e materiais](operacao/integracao-estoque-materiais-2026-10-27.md) registra a recuperação local das duas contribuições autorizadas, com decisões no [ADR-017](adr/ADR-017-integridade-estoque-e-materiais.md) e [operação dos materiais](operacao/materiais-consumo.md).

O [registro de publicação de estoque e materiais](operacao/publicacao-estoque-materiais-2026-10-27.md) descreve os gates, o backup, a publicação comprovada da API/frontend e o retorno que preserva os comprovantes.

A [correção do cancelamento no catálogo do Bar](operacao/correcao-cancelamento-bar-2026-10-27.md) registra a reprodução das navegações rápidas, a validação local e o estado da preparação para publicação somente web.

A organização em Gestor, Professor, Atendente e Cliente está no [ADR-019](adr/ADR-019-quatro-perfis-exclusivos.md), com procedimento de preview e conversão no [guia dos quatro perfis](operacao/quatro-perfis.md). A implementação é local; não representa conversão de contas hospedadas.


## Decisão e arquitetura

- [`adr/ADR-001-produto-standalone.md`](adr/ADR-001-produto-standalone.md)
- [`adr/ADR-002-hospedagem-railway-e-dominios-canonicos.md`](adr/ADR-002-hospedagem-railway-e-dominios-canonicos.md) — decisão intermediária superseded
- [`adr/ADR-003-dominios-quebranunca-e-isolamento-railway.md`](adr/ADR-003-dominios-quebranunca-e-isolamento-railway.md) — domínios preservados; hospedagem substituída pelo ADR-014
- [`adr/ADR-014-google-cloud-e-isolamento-por-cliente.md`](adr/ADR-014-google-cloud-e-isolamento-por-cliente.md) — migração Google Cloud, instância compartilhável e isolamento lógico
- [`arquitetura/HANDOFF_LongBeach_OS_Standalone_para_Work.md`](arquitetura/HANDOFF_LongBeach_OS_Standalone_para_Work.md)
- [`arquitetura/LongBeach_OS_Arquitetura_Standalone_v0.2.md`](arquitetura/LongBeach_OS_Arquitetura_Standalone_v0.2.md)
- [`arquitetura/C4-contexto.md`](arquitetura/C4-contexto.md)
- [`arquitetura/C4-conteineres.md`](arquitetura/C4-conteineres.md)
- [`arquitetura/convencoes-backend-frontend.md`](arquitetura/convencoes-backend-frontend.md)
- [`arquitetura/modelo-autenticacao-web-mobile.md`](arquitetura/modelo-autenticacao-web-mobile.md)
- [`arquitetura/modelo-dados-primeira-release.md`](arquitetura/modelo-dados-primeira-release.md)

- [`adr/ADR-007-area-pessoal-cliente.md`](adr/ADR-007-area-pessoal-cliente.md) — área pessoal, vínculos e confirmação de solicitações
- [`adr/ADR-012-c6-saldo-extrato-pix.md`](adr/ADR-012-c6-saldo-extrato-pix.md) — conta C6, evidência bancária e Pix da Quadra
- [`adr/ADR-013-despesas-pagamentos-e-reembolsos.md`](adr/ADR-013-despesas-pagamentos-e-reembolsos.md) — despesas, remuneração da equipe, acertos com sócios e comprovantes

## Migração

- [`migracao/auditoria-legado.md`](migracao/auditoria-legado.md)
- [`migracao/plano-transicao-e-rollback.md`](migracao/plano-transicao-e-rollback.md)

## Produto

- [`produto/backlog-fase-0.md`](produto/backlog-fase-0.md)
- [`produto/criterios-de-pronto.md`](produto/criterios-de-pronto.md)

## Operação

- [`operacao/perfil-cliente.md`](operacao/perfil-cliente.md) — operação, limites e aceite com clientes
- [`operacao/c6-integracao.md`](operacao/c6-integracao.md) — configuração, homologação, operação e retorno da integração C6
- [`operacao/despesas-e-pagamentos.md`](operacao/despesas-e-pagamentos.md) — lançamento simplificado, baixas parciais, reembolsos e implantação

- [`operacao/ci-cd-e-ambientes.md`](operacao/ci-cd-e-ambientes.md)
- [`operacao/google-cloud.md`](operacao/google-cloud.md) — runbook e histórico da migração concluída para Google Cloud
- [`operacao/financeiro-google-cloud-2026-10-25.md`](operacao/financeiro-google-cloud-2026-10-25.md) — release Financeiro publicada, artefatos, validações e recuperação
- [`operacao/deploy-railway-production.md`](operacao/deploy-railway-production.md)
- [`operacao/checklist-app-store-google-play.md`](operacao/checklist-app-store-google-play.md)
- [`operacao/matriz-de-riscos.md`](operacao/matriz-de-riscos.md)

O HANDOFF e o ADR-001 governam a independência do produto. O ADR-003 preserva os domínios, e o ADR-014 registra a migração de hospedagem para Google Cloud com isolamento lógico dos dados. O ADR-002 permanece como histórico superseded. O sistema legado permanece preservado até que o substituto seja validado e a janela de rollback seja encerrada formalmente.
