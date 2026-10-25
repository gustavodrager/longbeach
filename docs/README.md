# Documentação do Long Beach OS

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

## Migração

- [`migracao/auditoria-legado.md`](migracao/auditoria-legado.md)
- [`migracao/plano-transicao-e-rollback.md`](migracao/plano-transicao-e-rollback.md)

## Produto

- [`produto/backlog-fase-0.md`](produto/backlog-fase-0.md)
- [`produto/criterios-de-pronto.md`](produto/criterios-de-pronto.md)

## Operação

- [`operacao/perfil-cliente.md`](operacao/perfil-cliente.md) — operação, limites e aceite com clientes
- [`operacao/c6-integracao.md`](operacao/c6-integracao.md) — configuração, homologação, operação e retorno da integração C6

- [`operacao/ci-cd-e-ambientes.md`](operacao/ci-cd-e-ambientes.md)
- [`operacao/google-cloud.md`](operacao/google-cloud.md) — cadastro, infraestrutura, ensaio, migração e retorno; implantação ainda em preparação
- [`operacao/deploy-railway-production.md`](operacao/deploy-railway-production.md)
- [`operacao/checklist-app-store-google-play.md`](operacao/checklist-app-store-google-play.md)
- [`operacao/matriz-de-riscos.md`](operacao/matriz-de-riscos.md)

O HANDOFF e o ADR-001 governam a independência do produto. O ADR-003 preserva os domínios, e o ADR-014 registra a migração de hospedagem para Google Cloud com isolamento lógico dos dados. O ADR-002 permanece como histórico superseded. O sistema legado permanece preservado até que o substituto seja validado e a janela de rollback seja encerrada formalmente.
