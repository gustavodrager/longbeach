# Plano de transição e rollback

## Objetivo

Publicar e validar o Long Beach OS standalone sem interromper a operação, perder dados ou tornar a Plataforma QuebraNunca uma dependência. Os endereços oficiais são `longbeach.quebranunca.com.br` e `api.longbeach.quebranunca.com.br`. A web oficial já atende o primeiro endereço, com a API no segundo. A configuração de domínio, por si só, não muda a fonte oficial de escrita.

### Estado em 2026-10-05

- O serviço `web` e a API `api` do projeto standalone atendem os endereços oficiais e seguem o repositório `gustavodrager/longbeach`, branch `main`.
- O endereço `preview.longbeach.quebranunca.com.br` foi removido do binding Railway. Os endereços técnicos Railway permanecem para health check e retorno.
- O login Google está habilitado no endereço oficial para as contas autorizadas. O bootstrap automático de Owner permanece desabilitado.
- Os pacotes `fonte-0.xlsx` (80 linhas) e `fonte-1.xlsx` (1.031 linhas) estão em `NeedsReview` nas tabelas de staging. Nenhuma linha foi aplicada a cadastros operacionais; a fonte oficial de escrita continua sendo o sistema legado até novo aceite.

## Princípios

- Migração por cópia e conciliação; nunca mover ou apagar a única fonte.
- Um responsável e uma fonte de escrita explícitos por conjunto de dados em cada etapa.
- Importações idempotentes, identificadas por lote, arquivo, hash e linha de origem.
- Datas armazenadas em UTC; interpretação operacional em `America/Sao_Paulo`.
- Dados pessoais e credenciais não aparecem em logs, fixtures ou relatórios de CI.
- Alterações de domínio e de fonte oficial de escrita são decisões separadas e exigem registro e rollback próprios.
- Migrations de produção avançam; rollback de aplicação deve ser compatível com schema expand-and-contract.
- Publicação técnica, migração de dados e mudança da fonte oficial de escrita são decisões separadas.

## Etapas e portas de decisão

### T0 — Baseline e congelamento técnico do legado

1. Registrar commit/tag exatos do `dashboard/`, incluindo a correção de login que está localmente sem commit.
2. Inventariar deploy Sites, D1, Railway, volume, variáveis, domínios e certificados.
3. Exportar D1 e SQLite de forma consistente; calcular hash SHA-256 e guardar manifesto com contagem por tabela.
4. Versionar cópias imutáveis das duas planilhas e dos arquivos de controle.
5. Registrar quem pode escrever no sistema atual.

**Saída:** baseline reproduzível, backups legíveis e responsáveis definidos. Nenhuma mudança de DNS.

### T1 — Fundação standalone em paralelo

1. Criar monorepo, solução .NET, frontend React/Vite, PWA e Capacitor.
2. Subir PostgreSQL exclusivo de Development e Test.
3. Implementar health checks, migrations, logs estruturados, auditoria e identidade própria.
4. Executar pipeline sem acessar recursos QuebraNunca.

**Saída:** build e testes verdes; aplicação inicia localmente; `/health/live` e `/health/ready` validados.

### T2 — Staging e paridade mínima

1. Criar recursos exclusivos de Staging e usar os endereços técnicos do Railway, salvo aprovação explícita de subdomínios de homologação no namespace existente.
2. Reimplementar primeiro os fluxos que já recebem escrita: aluno, funcionário, projeto e estoque.
3. Recriar as visões de alunos e financeiro a partir de dados importados, mantendo indicadores de qualidade.
4. Cobrir permissões e auditoria com testes de integração e end-to-end.

**Saída:** lista de paridade assinada; nenhuma tela crítica depende de dado embutido no bundle.

### T2A — Production standalone em paralelo

1. Criar no Railway um projeto exclusivo com serviços `longbeach-web`, `longbeach-api` e PostgreSQL próprio.
2. Configurar secrets, logs, health checks, migrations controladas e bootstrap inicial sem referenciar recursos do projeto legado ou da Plataforma QuebraNunca.
3. Publicar web e API primeiro em domínios técnicos exclusivos do Railway.
4. Validar builds e health checks nesses endereços, executar o bootstrap/smoke direto da API e remover seus secrets temporários.
5. Associar `api.longbeach.quebranunca.com.br` à API standalone, validar TLS/readiness e manter esse domínio.
6. Publicar a web standalone em `longbeach.quebranunca.com.br`, validar login, cookie, refresh, logout, autorização negativa e auditoria; remover o preview do binding Railway depois da validação.
7. Preservar serviço, volume SQLite, banco D1 e endereço técnico do legado.
8. Manter os dados novos como staging controlado até uma autorização futura definir reconciliação e fonte oficial de escrita.

**Saída:** API e web standalone atendem os endereços oficiais; bootstrap desabilitado e secrets temporários removidos; o legado segue preservado no endereço técnico.

### T3 — Importação seca e reconciliação

1. Carregar arquivos e exports em tabelas de staging sem tocar nas tabelas finais.
2. Normalizar nomes, valores, datas e identificadores; não unir possíveis duplicatas automaticamente.
3. Produzir relatório: recebidos, válidos, rejeitados, duplicados, conciliados e pendentes.
4. Aprovar conflitos com usuário autorizado e registrar a decisão.
5. Reexecutar o mesmo lote para provar idempotência.

Em 2026-10-05, os dois pacotes de planilhas já foram recebidos em staging (80 e 1.031 linhas). Eles aguardam validação e reconciliação; a confirmação na tela não significa que dados foram aplicados.

**Saída:** totais por competência e saldos por item conciliados; diferenças conhecidas e aceitas.

### T4 — Ensaio operacional

1. Restaurar uma cópia sanitizada ou protegida do conjunto aprovado em Staging.
2. Executar roteiros por papel: administrador, gestor, professor e aluno.
3. Testar refresh token, revogação, autorização negativa, auditoria e restauração do PostgreSQL.
4. Testar web responsiva e builds móveis de desenvolvimento.
5. Executar teste de carga compatível com o uso esperado e verificar alertas.

**Saída:** aceite de Staging, backup restaurado em ambiente isolado e plano de corte com responsáveis.

### T5 — Futura migração operacional controlada

Esta etapa só começa com autorização específica dos responsáveis de produto e operação, após as saídas de T3 e T4. A web já usa o domínio oficial; esta etapa trata da troca controlada da fonte oficial de escrita. Não reassocie os domínios como parte da importação dos lotes.

1. Confirmar backup e restauração dos dois sistemas e comunicar uma janela curta de congelamento de escrita no legado.
2. Tirar export final de D1/SQLite e planilhas, importar somente o delta e reconciliar.
3. Colocar o legado em leitura ou restringir sua escrita e confirmar que seu domínio técnico Railway está acessível.
4. Revalidar TLS/readiness da API em `api.longbeach.quebranunca.com.br` e conferir ao vivo issuer, CookieDomain, CORS e `VITE_API_URL`.
5. Revogar sessões de teste. Confirmar que CORS aceita somente a origem oficial, que o preview não está associado no Railway e que o snapshot representa o live.
6. Fazer export final, carregar somente o delta em staging e reconciliar contagens, conflitos e saldos.
7. Validar login, refresh, CORS, importação e fluxos críticos pelos endereços oficiais.
8. Autorizar explicitamente o novo Production como fonte oficial de escrita.
9. Acompanhar erros, latência, auditoria e operações durante a janela reforçada.

**Saída:** após autorização e reconciliação, o novo sistema passa a ser a fonte de escrita; o legado permanece acessível por seu domínio técnico Railway, preferencialmente em modo somente leitura, durante a retenção definida.

### T6 — Estabilização e retirada posterior

1. Comparar diariamente contagens e indicadores durante a janela acordada.
2. Resolver pendências sem editar silenciosamente lotes importados.
3. Manter backups e deploys antigos por no mínimo 30 dias; o prazo final deve considerar obrigação legal e operacional.
4. Retirar credencial compartilhada, D1, SQLite e serviço Node somente após aceite formal, export final e teste de restauração.
5. Arquivar repositório e documentação do legado como somente leitura.

## Matriz de fonte de escrita

| Etapa | Legado | Staging novo | Production novo |
|---|---|---|---|
| T0–T2 | fonte operacional | testes/importações descartáveis | inexistente |
| T2A–T4 | fonte operacional no sistema legado | cópia para ensaio; 1.111 linhas em revisão | web e API oficiais, sem ser fonte oficial de escrita |
| T5 antes do congelamento | fonte operacional no sistema legado | staging e reconciliação | web e API oficiais, sem tráfego operacional de escrita |
| T5 durante o corte | congelado/somente leitura | referência | recebe importação final |
| T5 após aceite | fallback somente leitura no domínio técnico | referência | única fonte de escrita nos domínios oficiais |
| T6 após aceite | arquivado | ambiente normal de homologação | fonte oficial |

Nunca permitir escrita concorrente nos dois sistemas sem mecanismo formal de sincronização, que não faz parte desta fase.

## Mapeamento inicial de dados

| Origem | Destino sugerido | Controle obrigatório |
|---|---|---|
| `student_details` + registros históricos do bundle | `Person`, `StudentProfile`, `Enrollment` quando confirmado | `LegacySource`, `LegacyId`, lote e decisão de deduplicação |
| `staff` | `Person`, `EmployeeProfile`, `CompensationAgreement` | vigência da regra de pagamento e campos pendentes explícitos |
| `projects` | `Project`/`Task` | preservar status original, responsável textual e timestamp |
| `inventory_items` | `InventoryItem` | unidade imutável depois da primeira movimentação |
| `stock_movements` | `StockMovement` | ordem, tipo, quantidade assinada, saldo reconciliado e idempotência |
| séries de mensalidades e aulas | staging de importação; depois School/OperationalFinance | competência, valor, situação, origem por linha e conflitos |
| custos, aluguéis e saldos | staging; depois OperationalFinance/Schedule | não inferir saldo bancário a partir de resultado; conciliar separadamente |

## Procedimento de rollback da futura migração operacional

### Gatilhos

- falha de login ou autorização para usuários críticos;
- erro de escrita ou perda/duplicação de transações;
- readiness instável ou taxa de erro acima do limite definido no plano de corte;
- divergência material na reconciliação;
- indisponibilidade sem previsão dentro da janela acordada;
- auditoria ausente em operação crítica.

### Ações

1. Bloquear novas escritas no novo sistema e registrar horário/correlation IDs afetados.
2. Exportar as transações confirmadas desde o corte; não descartá-las.
3. Revogar sessões standalone e remover `https://longbeach.quebranunca.com.br` do CORS/validação de origem; se isso não puder ser comprovado, desabilitar a API antes de devolver o domínio ao legado.
4. Remover `longbeach.quebranunca.com.br` do web standalone e reassociá-lo ao serviço legado preservado, conforme o procedimento ensaiado.
5. Sincronizar o IaC da fase de rollback com `railway config pull`, revisão, commit e `railway config plan`; o snapshot não pode continuar declarando domínio/CORS oficial no standalone enquanto o legado o atende.
6. Reabilitar escrita no legado somente após decidir como reaplicar as transações capturadas.
7. Restaurar a revisão anterior dos serviços standalone; restaurar banco apenas se houver corrupção comprovada. Preferir migrations corretivas a rollback destrutivo.
8. Comunicar escopo e período afetados; reconciliar cada operação antes de uma nova tentativa.

### Pré-condições para um rollback real

- serviço legado, domínio técnico Railway e certificado válidos;
- credenciais de operação testadas e guardadas fora do repositório;
- procedimento de transferência e retorno de `longbeach.quebranunca.com.br` ensaiado, com responsáveis e tempos medidos;
- export final do legado disponível e verificado;
- backup do PostgreSQL restaurado com sucesso em ambiente isolado;
- scripts de importação e compensação idempotentes;
- responsável técnico e responsável de negócio presentes na janela.

## Critérios para desativar o legado

- 30 dias ou janela acordada sem incidente crítico atribuível à migração;
- usuários essenciais operando no novo sistema;
- totais e saldos reconciliados, com exceções formalmente aceitas;
- trilha de auditoria consultável;
- backup/restauração do Production comprovados;
- aplicativos não dependem de endpoint antigo;
- endereço técnico e dados antigos arquivados conforme retenção;
- termo de aceite e autorização explícita para desligar.
