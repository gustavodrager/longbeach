# Publicação de estoque e materiais — 27/10/2026

Estado inicial: plano preparado para a autorização explícita do proprietário de enviar ao GitHub e publicar a aplicação atualizada com backup, retorno e preservação dos dados. A execução e os artefatos finais serão registrados após as verificações. Este plano não declara uma publicação concluída.

## Escopo e gates

Destino existente: projeto `parsero-prod-20261022`, VM `longbeach-economy` em `southamerica-east1-a`, banco PostgreSQL 18 `longbeach`, frontend no site Firebase `parsero-prod-20261022`. Sem alterar DNS, infraestrutura, credenciais, flags bancárias ou dados de negócio.

A fonte deve ser um commit fixo na branch de estoque/materiais, em PR contra `codex/consolidacao-estrutura-20261026`, incorporando sua documentação atual. O workflow `production-approval.yml` repete a qualidade e exige aprovação do environment Production para o mesmo SHA. Ele não cria imagens ou publica a aplicação. A promoção usa API OCI linux/amd64 identificada pelo commit e digest, testada localmente, e web construída de um arquivo Git desse commit com configuração pública de produção. Fontes de build são temporárias; evidências e artefatos não contêm outra cópia de trabalho da aplicação.

Antes da janela: capturar a identidade efetiva da API, versão/release Firebase, hashes da configuração, estado dos contêineres, 27 IDs de migrations, owners/default grants, saúde e backups/WAL. Conferir disponibilidade da imagem anterior `61644951e6b0335e158537d8601d47d4404e559000233a5ee58d33266d0e25c7` e da versão web `8086df7666cf0657`; interromper se a produção tiver mudado. Preparar e conferir o digest novo antes de parar a API.

## Backup e migration única

1. Conferir o backup nativo e o WAL pelo runner existente. Preservar seus recibos e retenções.
2. Parar e drenar somente a API, incluindo seus workers; manter PostgreSQL, Caddy e arquivamento de WAL. Conferir ausência de escritores/transações da aplicação.
3. Criar um dump lógico privado consistente do banco congelado, com SHA-256. Restaurá-lo em PostgreSQL 18 local descartável, conferir tabelas, sequências e IDs, e ensaiar o SQL exato 27→28. Nenhum teste usa a conexão de produção.
4. O delta EF para `20261027135728_MaterialStockLedger` deve conter somente a tabela, FK, índices, check, função/trigger e registro da migration. Revisar e fixar seu hash e fronteira de transação. Executar uma única vez por job controlado `psql -X`, `ON_ERROR_STOP`, lock de release e timeouts; a conexão administrativa local assume `longbeach_migrator` antes do delta. Não usar o executor histórico Cloud Run ou migrations na inicialização da API.
5. Conferir 28 IDs, dados anteriores e sequência idênticos, ledger vazio, owner migrator, ACL runtime e trigger de imutabilidade. Testar os mesmos grants e a falha de alteração de comprovante no clone antes da execução real. Não criar entrada inicial fictícia, seed, usuário ou lançamento.
6. Atualizar somente `API_IMAGE` e recriar somente a API. Validar saúde, autenticação e endpoints; depois publicar os bytes web verificados no Firebase. Preservar banco, proxy, secrets e timers.

Uma falha não autoriza repetir automaticamente a migration. Inspecionar o recibo e o estado real antes de decidir a continuação. Não abrir escritores antigos para encurtar a janela.

## Retorno preservando os dados

O schema 28 é aditivo, mas a API anterior permite editar diretamente o saldo JSON de materiais. Isso viola o histórico após existir qualquer comprovante. Portanto **não há rollback automático da API para a imagem anterior com escrita aberta**, mesmo que sua inicialização funcione.

- Falha somente na interface: retornar à versão Firebase anterior mantendo a nova API protegida e o schema 28. Clientes antigos recebem recusa para edição direta de saldo; a correção da interface precede a retomada desse fluxo.
- Falha na API: manter a API parada/manutenção e os dados preservados; preparar correção progressiva ou um artefato comprovadamente compatível. A imagem anterior fica retida, mas só pode atender após revisão e bloqueio externo efetivo dos escritores incompatíveis. Não improvisar esse desbloqueio durante a falha.
- Necessidade de restauração: encerrar escritores, preservar também o estado posterior com todos os comprovantes, restaurar o backup primeiro em destino isolado e reconciliar o intervalo. Não restaurar sobre PostgreSQL ativo nem descartar lançamentos posteriores sem revisão específica.

Não executar `Down` que apague `material_movements`, reaplicar Terraform histórico, recriar Cloud SQL ou desligar os backups para realizar este retorno. Comprovantes históricos e originais arquivados permanecem intactos.

Evidências e dumps são privados: `LongBeach/evidencias/publicacao-estoque-materiais-2026-10-27/` e `LongBeach/dados-locais/backups/`. O [registro da integração local](integracao-estoque-materiais-2026-10-27.md) contém os testes anteriores; o [ADR-017](../adr/ADR-017-integridade-estoque-e-materiais.md) define as invariantes.
