# ADR-015 — VM econômica no Google Cloud com backup externo

Data: 26/10/2026. Implementação autorizada; o corte depende das verificações e da execução registrada no runbook.

## Contexto e decisão

O responsável aceita uma VM de produção com 4 GiB e um ponto único de falha para reduzir o custo recorrente. Permanecemos no Google Cloud em São Paulo, sem compromisso anual. A decisão substitui a exigência de Cloud SQL com reserva e de API Cloud Run/balanceador do ADR-014 para este estágio econômico; preserva os demais requisitos de isolamento, identidade, domínios, artefatos identificados e dados.

LongBeach usa uma VM própria com Docker Compose: PostgreSQL18, API publicada identificada por digest e proxy HTTPS. O frontend continua no Firebase Hosting. Preservam-se `longbeach.quebranunca.com.br`, `api.longbeach.quebranunca.com.br`, login Google, cookies, CORS e autorização da aplicação. A migração não ativa provedores bancários nem altera suas flags atuais.

Banco e API usam credenciais distintas e permissões específicas. Outros produtos não compartilham código, banco, credenciais ou runtime do LongBeach. O banco não publica5432 no host ou internet. Segredos ficam fora do repositório e da imagem, obtidos pelo bootstrap autorizado e montados com permissões restritas. A conta de serviço da VM usa IAM mínimo, sem arquivo de chave; limitar acesso a metadata às cargas que precisam dessas credenciais.

Há disco de dados separado do boot. Perder a VM ou a zona pode exigir reconstrução e restauração manual: não há reserva nem failover automático. Snapshots são complementares, não a única cópia. PostgreSQL18 e pgBackRest no mesmo container/UID999 enviam um full diário e WAL contínuo a um bucket privado regional fora da VM. Retenção temporal de oito dias fornece margem para uma janela de PITR de pelo menos sete dias depois de acumulado o histórico, condicionada à continuidade de WAL e backups íntegros. O estado de backup e espaço em disco exige alertas e ensaio real de restauração.

## Promoção e retorno

A VM candidata começa privada, sem gravadores nem tarefas automáticas. Migrações continuam sendo execução única e explícita: startup/seed automáticos permanecem desabilitados. Promover a mesma aplicação atualmente publicada, com commit/digest registrado, evitando introduzir funcionalidade incidental.

Antes da mudança: validar localmente a imagem, backup/PITR sintético, proxy/login e limites; depois validar GCS, backup e restauração isolada na infraestrutura real. Na janela: suspender gravações, drenar/parar workers da origem, gerar cópia final nativa PG18 com SHA256, restaurar no destino e conferir schema/migrations, contagens, totais, sequências e permissões. Nenhuma tarefa de destino pode executar simultaneamente à origem. Publicação e mudança DNS seguem os gates do ambiente de produção e a autorização registrada.

Preservar Cloud SQL/Cloud Run e seus artefatos durante estabilização; não apagar ou religar a origem automaticamente. Depois de gravações na VM, voltar exige transferir e reconciliar os dados atualizados. Mudar apenas DNS para uma cópia anterior não é rollback dos dados. O operador entrega custos observados, acessos e recuperação antes de encerrar a migração.

## Consequências

A economia troca disponibilidade gerenciada por administração de host, patches, capacidade, TLS, backup e recuperação. O banco pode ficar indisponível enquanto o host é reparado ou restaurado. O RPO depende do WAL já enviado; o RTO será medido em ensaio. Backups externos continuam necessários e têm custo por armazenamento, operações e transferência. Não contratar CUD antes de medir consumo e de o responsável aceitar separadamente o compromisso financeiro.

## Estado da preparação em 26/10/2026

A candidata privada passou pelos testes locais e de infraestrutura, builds da API/frontend, fixture GCS com recuperação latest/PITR e restauração lógica reconciliada da cópia real. A collation conserva `en_US.UTF8`/libc: somente a versão 2.19 da origem para 2.36 nativa foi aceita, com índices reconstruídos logicamente e índices/constraints válidos. Os dois grants administrativos de schema exclusivos do provedor foram auditados e não são transferidos; não se importam roles de Cloud SQL.

O full MAIN real e suas recuperações latest/PITR passaram com a cópia original preservada. A QA nativa privada passou em 30 verificações, incluindo 40 leituras concorrentes sem OOM; os recursos próprios dos ensaios foram removidos. Isso não substitui a validação de login Google e sessão pública. Alertas estão preparados. O corte e o aceite de produção continuam pendentes dos gates e da janela previstos no ADR-003; este estado não autoriza desativar a origem nem declara a VM como produção.

Procedimento: [Operação da VM Google](../operacao/google-vm.md) e [backup](../../deploy/google/vm/backup/README.md). Este ADR registra a decisão, não um corte já concluído.
