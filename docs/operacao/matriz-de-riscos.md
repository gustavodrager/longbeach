# Matriz de riscos

## Escala

- **Probabilidade:** Baixa (1), Média (2), Alta (3).
- **Impacto:** Baixo (1), Médio (2), Alto (3), Crítico (4).
- **Exposição:** probabilidade × impacto. 8–12 exige ação antes de Production; 5–7 exige mitigação planejada e alerta; 1–4 pode ser acompanhado.

## Riscos ativos

| ID | Risco | Prob. | Impacto | Exp. | Mitigação preventiva | Sinal/gatilho | Contingência/rollback | Dono sugerido |
|---|---|---:|---:|---:|---|---|---|---|
| R-01 | Perda ou divergência na migração de D1, SQLite, bundle e planilhas | 3 | 4 | 12 | exports imutáveis, hashes, contagens, staging, idempotência e aprovação humana | totais/saldos não conciliam | parar corte, manter legado como fonte e reprocessar lote | Produto + Dados |
| R-02 | Transferir o domínio web oficial antes de web, API ou certificados estarem prontos | 2 | 4 | 8 | smoke pelos domínios técnicos, TLS emitido, endereço técnico legado validado e critérios de go/no-go | login/readiness/fluxo crítico falha em `longbeach.quebranunca.com.br` | reassociar o domínio web ao serviço legado preservado e reconciliar qualquer transação nova | Operação |
| R-03 | Escrita concorrente no legado e no novo sistema antes da migração autorizada | 2 | 4 | 8 | Production novo restrito à validação, matriz de fonte de escrita e futura janela de congelamento | registros operacionais surgem nos dois sistemas | bloquear escrita operacional no novo, exportar deltas e reconciliar manualmente | Produto + Operação |
| R-04 | Credencial compartilhada do legado ser usada indevidamente | 3 | 3 | 9 | acesso restrito, rotação, monitoramento e migração para contas individuais | login inesperado ou mudança sem autor atribuível | rotacionar imediatamente e revisar dados desde último baseline | Segurança/Operação |
| R-05 | Autorização permitir acesso a PII, financeiro ou remuneração | 2 | 4 | 8 | policies, escopo por arena/pessoa e testes positivos/negativos | `403` ausente, relatório ou log mostra dados indevidos | desabilitar rota/feature flag, revogar sessões e investigar auditoria | Backend + Segurança |
| R-06 | Roubo/reutilização de refresh token | 2 | 4 | 8 | hash, rotação, família, secure cookie/storage, detecção de reuse | refresh antigo usado ou acesso por dispositivo desconhecido | revogar família/usuário, forçar login e rotacionar chaves se necessário | Backend |
| R-07 | Migration de banco incompatível derrubar versão ativa | 2 | 4 | 8 | expand-and-contract, teste de upgrade, job único e revisão | erro de query/readiness após migration | reimplantar versão compatível ou correção forward; restaurar só em corrupção | Backend + Operação |
| R-08 | Backup existir, mas não restaurar | 2 | 4 | 8 | testes periódicos de restauração e RPO/RTO medidos | restauração falha ou excede RTO | export alternativo, reconstrução por eventos/importações e incidente formal | Operação |
| R-09 | Acoplamento acidental à Plataforma QuebraNunca | 2 | 3 | 6 | ADR, revisão de dependências, recursos e secrets próprios | build/runtime chama recurso QuebraNunca | remover adapter/dependência; bloquear merge/deploy | Arquitetura |
| R-10 | PWA servir bundle antigo incompatível com API | 2 | 3 | 6 | cache de assets com hash, HTML/SW atualizável, API compatível | erros após deploy concentrados em PWA | invalidar HTML/SW, restaurar frontend anterior e manter compatibilidade | Frontend |
| R-11 | Aplicativo de loja não poder ser revertido rapidamente | 2 | 4 | 8 | compatibilidade de API, rollout gradual, feature flags e testes internos | crash/erro crítico cresce após release | pausar rollout, desabilitar feature no servidor e enviar hotfix | Mobile + Produto |
| R-12 | Offline duplicar chamada, inspeção ou movimentação | 2 | 3 | 6 | `ClientOperationId`, idempotência, estado de sync e conflito explícito | duas operações com mesmo intent/saldo inesperado | bloquear fila, compensar evento e revisar itens afetados | Mobile + Backend |
| R-13 | Dados pessoais vazarem em logs, imports ou CI | 2 | 4 | 8 | mascaramento, fixtures sintéticas, retenção e acesso mínimo | scanner/alerta ou descoberta em artefato | restringir acesso, apagar conforme procedimento, rotacionar secrets e avaliar incidente | Segurança/Privacidade |
| R-14 | Custos de infraestrutura crescerem sem visibilidade | 2 | 2 | 4 | budgets/alertas, limites de log/storage e medição por ambiente | aumento anormal de banco, egress ou logs | reduzir retenção não obrigatória, escalar recursos corretamente e investigar abuso | Operação/Finanças |
| R-15 | Dependência de poucas pessoas para contas e certificados | 3 | 3 | 9 | dois administradores, MFA, inventário e runbook de recuperação | administrador indisponível ou certificado perto de expirar | recuperação pelas contas institucionais e rotação controlada | Governança |
| R-16 | Conta de loja, marca ou políticas não estarem sob governança Long Beach | 2 | 4 | 8 | confirmar titularidade antes de submissão e documentar transferências | publicação exige conta pessoal/terceira | adiar publicação, regularizar conta e preservar IDs quando possível | Governança/Jurídico |
| R-17 | Cálculo financeiro reproduzir premissas incorretas do painel manual | 3 | 3 | 9 | separar caixa/competência, origem e conciliação; aceite de regras | resultado novo difere sem explicação | marcar indicador como não conciliado e manter fonte original visível | Produto + Financeiro |
| R-18 | Pessoas duplicadas por apelidos/nome inconsistente | 3 | 2 | 6 | staging, candidatos de match e aprovação, nunca merge automático irreversível | múltiplos cadastros parecem mesma pessoa | separar/unmerge com auditoria e corrigir vínculos | Produto + Dados |
| R-19 | Provedor hospedar recursos no mesmo workspace e permissões cruzarem produtos | 2 | 3 | 6 | projetos, service accounts, bancos e secrets separados; revisão IAM | serviço consegue ler recurso de outro produto | revogar credencial, criar conta de serviço exclusiva e auditar acessos | Operação/Security |
| R-20 | Requisitos das lojas mudarem durante preparação | 2 | 2 | 4 | revisar portais oficiais em cada release e manter checklist vivo | submissão rejeitada/novo formulário requerido | corrigir metadados/build e reagendar rollout | Mobile/Produto |
| R-21 | Legado same-site usar o cookie anti-CSRF pai se a origem oficial entrar no CORS antes do corte | 2 | 4 | 8 | antes do corte permitir somente preview, validar `Origin`, usar sessões de teste e revogá-las; no corte trocar CORS após retirar o legado | resposta autenticada aceita para a origem legada ou CORS contém preview e oficial juntos | remover a origem oficial ou desabilitar API, revogar sessões e só então devolver/manter o domínio no legado | Backend + Operação + Segurança |

## Riscos aceitos temporariamente na transição

| Risco | Justificativa temporária | Prazo de remoção |
|---|---|---|
| Legado Node/SQLite e Sites/D1 coexistem | necessários para continuidade e comparação | após aceite formal, janela mínima de 30 dias e backup restaurável |
| Credencial compartilhada no legado | evita interromper o painel antes da identidade nova | rotacionar agora; remover somente após futura migração operacional aceita e contas individuais validadas |
| Dados analíticos embutidos no JavaScript | preservam o histórico recebido enquanto o importador é construído | Fase 1, após importação reconciliada |
| Operação mobile offline parcial | reduz complexidade inicial | ampliar por fluxo com idempotência e métricas, não por promessa genérica |

## Revisão

Revisar esta matriz em cada promoção para Production, antes de qualquer migração de dados, mudança da fonte oficial de escrita ou alteração do domínio legado e a cada release de loja. Riscos com exposição 8 ou maior bloqueiam o marco associado enquanto a mitigação mínima não estiver comprovada ou houver aceite explícito do responsável.
