# Regras de trabalho — Long Beach OS

Estas regras se aplicam a todo o repositório.

## Autoridade e limites

- Trate `docs/arquitetura/HANDOFF_LongBeach_OS_Standalone_para_Work.md`, `docs/adr/ADR-001-produto-standalone.md` e `docs/adr/ADR-003-dominios-quebranunca-e-isolamento-railway.md` como direção arquitetural obrigatória. O ADR-003 prevalece sobre o ADR-002 para domínios e hospedagem.
- O `docs/adr/ADR-014-google-cloud-e-isolamento-por-cliente.md` substitui a escolha do provedor nesses registros: Google Cloud é o destino autorizado, com os domínios preservados e bancos/usuários próprios por cliente mesmo quando a instância física é compartilhada. A implantação permanece sujeita à conferência e à janela de corte; não trate a preparação local como migração já concluída.
- Mantenha o Long Beach OS como produto standalone, com repositório, solução, frontend, banco, autenticação, migrations, storage, observabilidade e deploy próprios.
- Não adicione dependência de código, pacote interno, banco, API, autenticação, frontend, migration, storage, segredo ou runtime de outro produto.
- O uso do domínio administrativo `quebranunca.com.br` não autoriza acoplamento técnico.

## Preservação e migração

- Não altere, desligue ou apague o sistema legado a partir deste repositório.
- Importe dados somente por processo explícito de staging, validação, reconciliação e proveniência.
- IDs legados permanecem como referência externa; não os trate como identidade estável do novo domínio.
- Faça a transição por incrementos reversíveis e preserve uma rota de rollback até o aceite formal.

## Segurança e ambientes

- Nunca versione secrets, dados pessoais reais, dumps de produção, certificados ou chaves de assinatura.
- Isole Development, Test, Staging e Production, inclusive banco, credenciais, storage e chaves JWT.
- Use contas individuais, papéis e permissões. Toda mudança relevante deve produzir auditoria sem registrar senha ou token.
- Execute migrations de ambientes hospedados por job único e controlado. Não dependa de migrations concorrentes em cada réplica.
- Produção exige aprovação no environment e promoção de artefato identificado por commit/digest.

## Qualidade

- Preserve a separação entre Domain, Application, Infrastructure, Contracts e Api.
- Adicione testes para regras de domínio, autenticação, autorização, auditoria, migrations e fluxos críticos.
- Antes de concluir uma mudança, execute os testes afetados e verifique build da API e do frontend.
- Atualize ADRs, diagramas e runbooks quando uma decisão arquitetural ou operacional mudar.

## Custos e infraestrutura

- Priorize economia e reaproveitamento da infraestrutura existente, conforme orientação do proprietário em 25/10/2026.
- Não crie ambiente de homologação ou banco adicional apenas para igualar versões. Use validação local quando ela atender à necessidade; só provisione infraestrutura adicional quando houver uma necessidade concreta.
- Ao cancelar uma preparação, confira e remova somente os recursos temporários criados para ela, preservando dados anteriores e produção. Registre o que foi removido e os custos recorrentes que permanecerem necessários.
- Faça backup somente quando necessário; prefira uma cópia local quando essa for a alternativa adequada. Não crie cópias hospedadas preventivamente sem necessidade.
- A economia não autoriza compartilhar credenciais ou banco de produção com testes, apagar dados existentes ou desativar componentes necessários ao funcionamento do sistema.
