# Publicação de estoque e materiais — 27/10/2026

Publicação concluída em 27/10/2026: API e frontend da fonte `b71dbf22127a6475b91770ba8f643df7933330b9`, com schema atualizado de 27 para 28, backup, ensaio real e dados anteriores preservados. A API foi promovida às 17h20m59s UTC e o frontend às 17h33m35.012s UTC (14h33m35 de Brasília), seguido das verificação pública e conferência da tela de acesso descritas abaixo. O [registro da release](release-google-vm.json) identifica os artefatos efetivos e os hashes dos recibos. A autorização direta incluiu backup, retorno e preservação dos dados.

## Escopo e gates

Destino existente: projeto `parsero-prod-20261022`, VM `longbeach-economy` em `southamerica-east1-a`, banco PostgreSQL 18 `longbeach`, frontend no site Firebase `parsero-prod-20261022`. Sem alterar DNS, infraestrutura, credenciais, flags bancárias ou dados de negócio.

A fonte fixada é `b71dbf22127a6475b91770ba8f643df7933330b9`, na branch `codex/estoque-materiais-20261027`, com revisão no [PR48](https://github.com/gustavodrager/longbeach/pull/48) contra a consolidação. O gate REAL foi o workflow `release-images.yml`, [run40542381209](https://github.com/gustavodrager/longbeach/actions/runs/40542381209), concluído com sucesso e revisão do proprietário no environment Production para o mesmo SHA. O workflow `production-approval.yml` planejado inicialmente não estava registrado na branch default, não foi executado e foi retirado como redundante. O gate publica imagens no GHCR; isso não executa deploy nem substitui a prova do OCI efetivamente promovido ao Artifact Registry.

A API OCI linux/amd64 foi construída uma vez e testada localmente; o frontend foi construído de um arquivo Git da mesma fonte com configuração pública de produção. Fonte igual não implica digests iguais entre builds independentes. Fontes de build são temporárias; evidências e artefatos não contêm outra cópia de trabalho da aplicação. Um commit posterior de documentação não altera a fonte b71 dos artefatos existentes.

## Execução comprovada da API

O congelamento e backup concluíram às 17h18m25s UTC. Somente a API e seus workers foram parados; PostgreSQL e Caddy permaneceram ativos e preservados. O dump privado foi transferido pelo hash e restaurado em PostgreSQL 18 local isolado. O ensaio real, identificado por `is_synthetic: false`, conferiu 59 tabelas, uma sequência e 27 migrations, aplicou o job exato e comprovou rollback total em falha injetada após o DDL, permissões runtime, imutabilidade e remoção do contêiner descartável.

O delta EF tem SHA-256 `2eabf13725f2682783780dcffe20244f9d494c7f72fc752a0cb273aa7a23e5b6`; o job SQL exato, com role migrator, guarda dos 27 IDs, lock e timeouts, tem SHA-256 `541b176b3bd54ef6a2457688e0e3b37cd52e256ea6db235730ea3c19e48d55b8`. O mesmo job foi executado uma vez em produção. Antes da nova API, foram conferidos 28 IDs, os dados e a sequência anteriores idênticos, ledger vazio, owner/grants, função/trigger e validade de índices/constraints. A promoção concluiu às 17h20m59s UTC, recriando somente a API por digest. A conferência externa e o pós-check aprovaram saúde/TLS200, autenticação obrigatória 401, configurações e contêineres preservados, backup/WAL correntes e zero WAL pendente.

## Publicação e conferência do frontend

O frontend foi publicado uma vez no Firebase às 17h33m35.012s UTC, versão `sites/parsero-prod-20261022/versions/001ec4e450b73ac6`, release `sites/parsero-prod-20261022/channels/live/releases/1793122415012000`. A falha inicial do preflight TLS local foi resolvida com raízes públicas, preservando a validação TLS e os mesmos bytes do artefato, sem reconstrução. A versão anterior `8086df7666cf0657` continua identificada para retorno apenas da interface.

A conferência pública terminou às 17h34m12s UTC: os 73 arquivos correspondem aos hashes do artefato, seis rotas SPA, headers/TLS e configuração Firebase passaram, a identidade live permaneceu estável e os metadados privados de build não foram expostos. O hash da árvore pública é `425b0e4ebcea73884ccdc4283b6eef89f41723718874f6d71a6f4c0fc2ec5937`. Os helpers web não alteraram a VM ou o banco.

Às 17h34m55s UTC, a aba própria de teste ativou o PWA atualizado, renderizou a tela de login e o botão Google e voltou ao login ao abrir a rota protegida de materiais. Não houve novo login Google, conferência de telas autenticadas ou escrita de negócio. A validação pública dos bytes foi registrada separadamente dessa conferência de navegador. Clientes antigos continuam sujeitos à proteção de saldo da nova API.

## Procedimento aplicado nesta publicação

Antes da janela: capturar a identidade efetiva da API, versão/release Firebase, hashes da configuração, estado dos contêineres, 27 IDs de migrations, owners/default grants, saúde e backups/WAL. Conferir disponibilidade da imagem anterior `61644951e6b0335e158537d8601d47d4404e559000233a5ee58d33266d0e25c7` e da versão web `8086df7666cf0657`; interromper se a produção tiver mudado. Preparar e conferir o digest novo antes de parar a API.

### Backup e migração única

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
