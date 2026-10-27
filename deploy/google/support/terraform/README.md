# Suporte da produção na VM

Raiz canônica para os recursos de apoio que continuam necessários após a retirada da infraestrutura gerenciada anterior. Ela reutiliza os mesmos endereços Terraform e o estado existente de produção; não é um novo ambiente nem cria a VM.

Preserva APIs habilitadas, todos os recipientes de segredos de produção, o segredo administrativo de recuperação, o repositório de imagens `longbeach`, o projeto/site Firebase, o domínio web e o orçamento já existente. A VM, seus discos, seu IP, o bucket de backups e o monitoramento continuam em seu estado próprio, fora desta raiz.

Não declara Cloud SQL, Cloud Run, jobs, contas de serviço da origem, permissões dessas contas ou balanceador. O bloco `removed` abandona somente os filhos `google_sql_database.client` no estado, com `destroy=false`, para evitar um `DROP DATABASE` separado. A exclusão da instância antiga exige preparação conferida das proteções e da retenção de backups; a ausência da instância nesta raiz não substitui essa verificação.

Usar somente com o backend de produção já existente, prefixo `longbeach/production`. Nunca usar o prefixo `longbeach-economy-vm/production`. Os arquivos de variáveis privados devem vir do inventário atual e do plano revisado; não reaplicar exemplos ou arquivos históricos. As variáveis antigas são mantidas para compatibilidade, mas não recriam os recursos omitidos. Workers, acesso público da API antiga e outros clientes são recusados.

Retirada executada e conferida em 26/10/2026: este estado mantém 27 recursos de apoio, e o plano completo posterior retornou sem alterações. Instância Cloud SQL, Run/jobs, balanceador e identidades da origem estão ausentes. As cópias nativas retidas foram conferidas no projeto; não excluir o projeto ou os buckets de recuperação. A configuração local isoladamente não comprova execução: consultar os recibos do runbook. Toda aplicação futura depende do plano salvo e revisado. Não executar `destroy` desta raiz.

Verificação local: `terraform fmt -check -recursive`, `terraform validate` e `terraform test` com provedores simulados. Não precisa de credenciais ou acesso ao Google para os testes.
