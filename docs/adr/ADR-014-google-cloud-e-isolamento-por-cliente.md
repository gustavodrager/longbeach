# ADR-014 — Google Cloud e isolamento por cliente

Data: 22/10/2026. Decisão de destino autorizada; implantação ainda em preparação.

## Decisão

Administrar a infraestrutura pelo Google Cloud da conta `parserotech@gmail.com`, com faturamento brasileiro em reais no CPF de Gustavo. Migrar primeiro o LongBeach para São Paulo (`southamerica-east1`), preservando o Railway até validação e janela de retorno. Cadastro, identidade, dados de cobrança e aceite dos termos dependem do responsável na interface oficial do Google.

Produção e staging usam projetos, bancos, secrets, contas de serviço e estados Terraform separados. A conta administrativa não é credencial da aplicação. Cada aplicação e ambiente conservam autenticação, repositório, migrations, imagens, deploy, logs e permissões próprios.

O PostgreSQL de produção será Cloud SQL Enterprise, com principal e reserva em zonas distintas, inicialmente 1 CPU dedicada, 4 GiB e SSD de 20 GiB. Backups diários e recuperação pontual de sete dias permanecem habilitados. O tamanho é uma candidata sujeita a ensaio e acompanhamento; não é capacidade já comprovada para os três produtos. Compromisso anual não será contratado antes dessa validação.

A mesma instância poderá atender outros clientes, cada qual com database, proprietário/migrador e usuário de runtime próprios. Nenhum runtime recebe papel administrador nem acesso ao banco de outro cliente. Revogar `CONNECT` de `PUBLIC` em cada database e privilégios públicos dos schemas é parte obrigatória do provisionamento; criar um usuário diferente não basta. A indisponibilidade e a capacidade da instância são compartilhadas. No primeiro ciclo, apenas o database LongBeach e seus consumidores são habilitados.

A API usa Cloud Run com CPU contínua durante a migração, pois há conciliações periódicas. O destino começa com `BackgroundJobs__Enabled=false` e sem invocação pública (`public_api_enabled=false`); testes do candidato exigem IAM Google e a autenticação própria da aplicação. A ativação pública e dos workers depende da janela de corte, de encerrar os workers da origem e de concluir a conferência. Migrations usam um job único, explícito e com imagem fixada por digest. Seeds e migrations automáticas no startup ficam desabilitados.

O frontend React/PWA fica no Firebase Hosting. A API usa um global external Application Load Balancer para manter domínio e cookies atuais (`lb_refresh`, `lb_csrf`). Não colocar a API atrás de rewrite Firebase: esse caminho remove cookies diferentes de `__session`. O custo fixo adicional do balanceador, antes de tráfego, é aproximadamente US$ 18,25/mês (730 horas); deve constar do orçamento. Não há balanceador adicional obrigatório por cliente no mesmo projeto.

O Cloud SQL usa IPv4 sem redes autorizadas, com conexão pelo Auth Proxy/conector autenticado e IAM, além dos usuários PostgreSQL próprios. O conector cifra o transporte. Esta configuração não exige VPC privada ou conexão PostgreSQL aberta à internet; redes universais não serão autorizadas. As credenciais administrativas não são distribuídas aos runtimes.

Permanecem os domínios `longbeach.quebranunca.com.br` e `api.longbeach.quebranunca.com.br`, os limites atuais dos cookies, CORS e identidade própria. A zona DNS existente continua sob administração atual. Os módulos C6/PagBank conservam flags e credenciais de cada ambiente; a mudança de provedor não ativa operações bancárias.

## Transição e limites

Este ADR substitui somente a escolha do Railway e a exclusividade da instância física de PostgreSQL nos ADRs 002/003. Preserva independência lógica dos dados e todas as restrições de acoplamento. Não autoriza desligar/apagar o legado, publicar uma nova funcionalidade financeira ou alterar DNS sem a janela de migração combinada.

Migrar a base e a aplicação publicada antes de incorporar a release financeira pendente. Não executar workers simultaneamente na origem e destino. Após o primeiro registro confirmado no Google, retornar à cópia antiga requer reconciliação dos dados; DNS sozinho não é rollback dos dados.

Procedimento, gates e estado real estão em [Migração para Google Cloud](../operacao/google-cloud.md).
