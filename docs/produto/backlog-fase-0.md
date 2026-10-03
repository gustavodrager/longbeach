# Backlog da Fase 0 — Fundação

## Objetivo da fase

Entregar uma base standalone executável, segura e publicável, capaz de sustentar as fases funcionais sem depender da Plataforma QuebraNunca. A Fase 0 prova arquitetura, identidade, persistência, auditoria, ambientes e entrega contínua; não tenta concluir regras complexas da escola.

## Prioridades

- **P0:** necessário para considerar a fundação segura e implantável.
- **P1:** necessário antes do primeiro uso real, mas pode seguir após o primeiro esqueleto executável.
- **P2:** preparação sem bloquear o bootstrap.

## Backlog

| ID | Pri. | Entrega | Critérios de aceite resumidos | Dependências |
|---|---:|---|---|---|
| F0-001 | P0 | Repositório standalone | `longbeach-os` possui histórico próprio, README, licença/uso definido, CODEOWNERS quando houver time e nenhuma referência de runtime à QuebraNunca | — |
| F0-002 | P0 | ADR e C4 | ADR-001 aceito; contexto e contêineres renderizam; limites e integrações futuras estão explícitos | F0-001 |
| F0-003 | P0 | Solução .NET | `LongBeach.sln` contém Api, Application, Domain, Infrastructure e Contracts com dependências testadas | F0-001 |
| F0-004 | P0 | API mínima | API inicia, expõe versionamento/OpenAPI por ambiente, Problem Details e correlation ID | F0-003 |
| F0-005 | P0 | Frontend React/Vite | app TypeScript strict inicia, roteia uma área pública/privada e consome configuração de ambiente tipada | F0-001 |
| F0-006 | P0 | PostgreSQL local e Test | compose sobe PostgreSQL próprio; migration vazia/fundação aplica do zero; testes não usam SQLite/in-memory | F0-003 |
| F0-007 | P0 | Configuração por ambiente | Development, Test, Staging e Production possuem validação fail-fast e nenhum secret versionado | F0-004, F0-006 |
| F0-008 | P0 | Identidade própria | login, refresh rotativo, logout, revogação e recuperação inicial funcionam com tokens armazenados conforme canal | F0-006 |
| F0-009 | P0 | Papéis e permissões | baseline Owner/Admin/Manager/Teacher/Operations/Student/Viewer/Auditor; policies cobertas por testes positivos e negativos | F0-008 |
| F0-010 | P0 | Auditoria | login e mutações críticas gravam ator, ação, alvo, horário e correlação, sem secrets/PII excessiva | F0-008 |
| F0-011 | P0 | Health checks | liveness e readiness separados; readiness falha sem PostgreSQL; resposta pública não revela infraestrutura | F0-004, F0-006 |
| F0-012 | P0 | Testes base | unitários e integração executam local/CI; API real aplica migrations em PostgreSQL efêmero | F0-003, F0-006 |
| F0-013 | P0 | CI de pull request | restore/install reproduzível, format/lint, typecheck, build, testes, migration check e scan de secrets | F0-005, F0-012 |
| F0-014 | P0 | Pipeline de deploy | artefatos imutáveis, promoção por ambiente, migrations controladas, smoke test e rollback de app documentado | F0-013 |
| F0-015 | P0 | Ambientes isolados | Test efêmero, Staging e Production usam banco, secrets, storage, logs e URLs exclusivos | F0-007, F0-014 |
| F0-016 | P0 | Proteção do legado | baseline/tag/export/hash do painel, D1, SQLite e planilhas; sistema atual continua acessível | — |
| F0-017 | P1 | Design system inicial | tokens Long Beach, tipografia, campos, botões, tabela/cartão, feedback, navegação e contraste AA | F0-005 |
| F0-018 | P1 | Shell autenticado responsivo | desktop oferece detalhe; mobile oferece resumo e tarefas; navegação respeita permissões | F0-008, F0-009, F0-017 |
| F0-019 | P1 | PWA | manifest, ícones, instalação, shell seguro, atualização avisada e política de cache que não guarda resposta sensível | F0-005, F0-017 |
| F0-020 | P1 | Capacitor iOS/Android | projetos sincronizam, IDs `br.com.longbeacharena.app`, ambientes separados e adapters de secure storage/conectividade | F0-019 |
| F0-021 | P1 | Dispositivos e sessões | usuário lista/revoga sessões; instalação mobile e push token possuem lifecycle independente | F0-008, F0-020 |
| F0-022 | P1 | Storage próprio | upload por URL restrita, confirmação, metadados, limites de MIME/tamanho e exclusão coordenada | F0-006 |
| F0-023 | P1 | Outbox e notificações base | evento é persistido na transação, processado idempotentemente e retentado sem duplicar envio | F0-006 |
| F0-024 | P1 | Observabilidade | logs estruturados, métricas/trace básico, dashboards e alertas mínimos por ambiente | F0-011, F0-015 |
| F0-025 | P1 | Backup e restauração | backup automatizado e restauração comprovada em ambiente isolado, com RPO/RTO aprovados | F0-015 |
| F0-026 | P1 | Importação base | lote, linha, hash, validação, revisão e aplicação idempotente prontos para as planilhas | F0-006, F0-010, F0-016 |
| F0-027 | P1 | Contratos frontend/API | OpenAPI gera cliente ou tipos; drift quebra o CI; erros seguem Problem Details | F0-004, F0-005 |
| F0-028 | P1 | Runbooks | deploy, migration, rollback, incidente, rotação de secret e restauração documentados | F0-014, F0-025 |
| F0-029 | P1 | Privacidade e termos | responsáveis, contato, retenção inicial, política e termos preparados antes de usuários externos/lojas | F0-022 |
| F0-030 | P2 | Adapters nativos base | câmera, deep link, push e rede possuem interface e implementação de desenvolvimento | F0-020, F0-021 |
| F0-031 | P2 | Fila local controlada | estrutura de `ClientOperationId`, status e retentativa existe sem prometer offline para todos os fluxos | F0-020, F0-023 |
| F0-032 | P2 | Performance baseline | orçamento de bundle, tempo de boot, latência e consultas medidos em Staging | F0-015, F0-018 |

## Sequência incremental recomendada

1. **Esqueleto reproduzível:** F0-001 a F0-007 e F0-011/012.
2. **Segurança:** F0-008 a F0-010, F0-013 e F0-027.
3. **Entrega:** F0-014 a F0-016, F0-024/025 e F0-028.
4. **Experiência:** F0-017 a F0-021.
5. **Capacidades de plataforma:** F0-022/023/026 e F0-029 a F0-032.

Cada incremento deve iniciar e passar testes antes do próximo. Funcionalidades novas permanecem atrás de rotas não publicadas ou feature flags próprias até satisfazer seus critérios.

## Fora da Fase 0

- regras completas de turmas, matrículas, aulas, presença e reposição;
- cobrança real, conciliação, fiscal/contábil e integração de pagamento;
- agenda/grupos completos e resolução de conflito de quadra;
- bar/PDV e estoque comercial avançado;
- WhatsApp;
- integração com a Plataforma QuebraNunca;
- offline total ou sincronização genérica.
