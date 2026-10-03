# Documentação do Long Beach OS

## Decisão e arquitetura

- [`adr/ADR-001-produto-standalone.md`](adr/ADR-001-produto-standalone.md)
- [`adr/ADR-002-hospedagem-railway-e-dominios-canonicos.md`](adr/ADR-002-hospedagem-railway-e-dominios-canonicos.md) — decisão intermediária superseded
- [`adr/ADR-003-dominios-quebranunca-e-isolamento-railway.md`](adr/ADR-003-dominios-quebranunca-e-isolamento-railway.md) — decisão vigente de domínios e hospedagem
- [`arquitetura/HANDOFF_LongBeach_OS_Standalone_para_Work.md`](arquitetura/HANDOFF_LongBeach_OS_Standalone_para_Work.md)
- [`arquitetura/LongBeach_OS_Arquitetura_Standalone_v0.2.md`](arquitetura/LongBeach_OS_Arquitetura_Standalone_v0.2.md)
- [`arquitetura/C4-contexto.md`](arquitetura/C4-contexto.md)
- [`arquitetura/C4-conteineres.md`](arquitetura/C4-conteineres.md)
- [`arquitetura/convencoes-backend-frontend.md`](arquitetura/convencoes-backend-frontend.md)
- [`arquitetura/modelo-autenticacao-web-mobile.md`](arquitetura/modelo-autenticacao-web-mobile.md)
- [`arquitetura/modelo-dados-primeira-release.md`](arquitetura/modelo-dados-primeira-release.md)

## Migração

- [`migracao/auditoria-legado.md`](migracao/auditoria-legado.md)
- [`migracao/plano-transicao-e-rollback.md`](migracao/plano-transicao-e-rollback.md)

## Produto

- [`produto/backlog-fase-0.md`](produto/backlog-fase-0.md)
- [`produto/criterios-de-pronto.md`](produto/criterios-de-pronto.md)

## Operação

- [`operacao/ci-cd-e-ambientes.md`](operacao/ci-cd-e-ambientes.md)
- [`operacao/deploy-railway-production.md`](operacao/deploy-railway-production.md)
- [`operacao/checklist-app-store-google-play.md`](operacao/checklist-app-store-google-play.md)
- [`operacao/matriz-de-riscos.md`](operacao/matriz-de-riscos.md)

O HANDOFF e o ADR-001 governam a independência do produto. O ADR-003 registra a decisão vigente de hospedagem e domínios; o ADR-002 permanece apenas como histórico superseded. O sistema legado permanece preservado até que o substituto seja validado e a janela de rollback seja encerrada formalmente.
