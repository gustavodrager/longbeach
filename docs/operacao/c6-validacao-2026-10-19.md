# C6 — validação de implementação em 2026-10-19

Implementação: `2053ce442625484c8ad7f4ec647799e12e1505f1`, sobre a versão de produção `11689011ff7bd0ec6ece7db333e4378d9bc3bd79` e seu registro `046ef43`. [Revisão #43](https://github.com/gustavodrager/longbeach/pull/43).

## Evidências

- Build .NET Release sem erros ou avisos; frontend TypeScript/Vite/PWA concluído.
- Banco PostgreSQL local novo: 413 testes unitários e 336 de integração, todos aprovados.
- Interface: 409 testes em 45 arquivos, todos aprovados.
- [CI 39346680034](https://github.com/gustavodrager/longbeach/actions/runs/39346680034): PostgreSQL 17 e 18 e frontend aprovados. Inclui aplicação das migrations, readiness e restauração sintética de backup.
- Navegador local, usuário fictício: acesso ao financeiro, estado C6 não conectado sem saldo inventado, extrato vazio com identificação de sandbox e diagnóstico de recursos desativados. Extrato e integrações responderam HTTP 200.
- Nenhuma chamada real ao C6: homologação, credenciais, certificado, callbacks e movimentações reais continuam pendentes.

## Preparação da publicação

Snapshot Railway importado sem valores de secrets e plano sem diferenças antes da preparação. A promoção prevê somente API e web no projeto standalone, mantendo demais recursos, domínios e ambientes. Todas as flags C6 são falsas por padrão e não há variáveis C6 configuradas na API de produção.

A criação de um snapshot manual do PostgreSQL pelo recurso nativo do Railway falhou duas vezes com `Failed to create a backup`; listagem posterior vazia, sem ID de backup. Volume conferido no projeto/ambiente corretos, disponível e com espaço. Não foi ativado PITR nem alterado agendamento, serviço de banco, permissões ou rede. Uma alternativa de backup com credencial temporária de servidor depende de autorização específica do responsável.

Até esta evidência, não houve deploy da integração nem execução das novas migrations em produção. A restauração sintética do CI não comprova a existência de backup de produção. Registrar IDs dos deployments, migrations e verificações após a promoção efetiva. A ativação bancária continuará dependendo do [roteiro C6](c6-integracao.md).
