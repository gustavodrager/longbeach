# Metadados da homologação encerrada

Raiz canônica do estado existente de homologação após a retirada autorizada dos recursos hospedados. Não cria outro ambiente, banco ou cópia da aplicação.

Preserva somente os endereços Terraform das APIs habilitadas, do projeto Firebase e de seu site padrão `parsero-staging-20261022`, já desativado. O site padrão tem `deletion_policy=PREVENT`; esta raiz conserva seus metadados sem publicar conteúdo ou reativar a hospedagem. O projeto e o bucket de estado existentes permanecem disponíveis para o estado e os backups retidos, gerenciados fora desta raiz.

Cloud SQL, segredos, imagens, Cloud Run, jobs, contas de serviço e suas permissões deixam de ser declarados. As proteções de exclusão persistidas precisam ser preparadas e conferidas antes do plano final. O bloco `removed` abandona somente `google_sql_database.client` no estado com `destroy=false`, evitando um `DROP DATABASE` separado antes da exclusão da instância.

Usar exclusivamente o backend de homologação existente, conferindo seu bucket e prefixo no inventário operacional. Nunca usar o estado de produção nem o estado da VM. As variáveis antigas são mantidas para compatibilidade; a raiz rejeita produção, outro projeto, outro site, API, workers, outros clientes, orçamento e domínio personalizado.

Retirada executada e conferida em 26/10/2026: homologação está sem banco, VM, disco, IP, Run/job ou repositório de imagens. Este estado conserva 17 metadados, e o plano completo posterior retornou sem alterações. Seis backups nativos foram listados como `SUCCESSFUL` no projeto depois da exclusão da instância. O projeto preserva as cópias nativas; o bucket conserva o estado Terraform. Não excluir nenhum dos dois. Consultar os recibos do runbook antes de qualquer aplicação futura. Não executar `destroy` desta raiz.

Verificação local: `terraform fmt -check -recursive`, `terraform validate` e `terraform test` com provedores simulados. Nenhuma chamada ao Google é necessária para os testes.
