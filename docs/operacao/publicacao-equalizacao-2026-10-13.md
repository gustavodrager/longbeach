# Equalização de homologação e produção — 13/10/2026

## Versão e autorização

O responsável autorizou na conversa publicar as alterações validadas em homologação e equalizar os ambientes. O artefato de aplicação é o commit `d1d3dd810b07f47f0cf52de1ef47b5163425a82d`, branch `codex/current-finance-20261013`, revisado na [PR 31](https://github.com/gustavodrager/longbeach/pull/31), sobre a PR 30 de homologação.

A equalização promove código. Bancos, identidades, chaves, credenciais, endereços e configurações de pagamento continuam separados. Produção preserva o login Google, a integração EDI e as flags existentes de cobrança. Os recursos de teste e a exceção de notificações sem assinatura exigem Staging/Sandbox; não são habilitados em Production.

## Validação

[CI 38463796385](https://github.com/gustavodrager/longbeach/actions/runs/38463796385) aprovada no commit exato: 275 testes unitários, 285 de integração, 319 frontend e 14 dos conversores. O backend foi executado em PostgreSQL 17 e 18, sem testes ignorados, incluindo migrations, readiness, auditoria de leitura e restauração sintética. Essa restauração de CI não é restauração do banco real.

Homologação publicada com sucesso:

- API: `00eb3953-8943-4eba-ba24-c8a418e04764`.
- Web: `b9c5530d-6c6c-4b3c-9580-0d53ad6cd5dd`.
- O Chrome confirmou a sessão do avaliador, cinco pendências somando R$ 50 e tabela com o mesmo total, R$ 10 pendentes nas comandas e nenhum dinheiro em caixas abertos. Não houve erro no console da página. A consulta financeira anônima retornou 401 e o health check 200.

## Visão financeira

A posição interna é consultada a cada 30 segundos e informa o horário da consulta. Contas a receber descontam pagamentos líquidos confirmados vinculados; estornos confirmados reabrem saldo. O detalhe apresenta valor original, pagamento e saldo pendente a partir do mesmo snapshot de banco. Financeiro, comandas e caixas físicos não são somados como saldo bancário.

O saldo atual da conta PagBank continua sem integração disponível e aparece como não conectado. A carteira EDI mostra o último dia validado, com data e coleta, em D+1. O extrato importado e o controle mensal ficam em histórico. Atualizar a tela não transforma referências antigas em saldo de hoje. Vendas e comandas abertas no PagVendas ainda não são sincronizadas em tempo real.

## Banco, cópia local e promoção

O responsável determinou não configurar backups recorrentes em nuvem e autorizou uma cópia local por ser necessária à migration das assinaturas. A tentativa de snapshot manual no Railway falhou; a listagem posterior não continha backup. Nenhum agendamento ou PITR foi habilitado.

Uma chave SSH temporária foi autorizada explicitamente e registrada, mas a conexão inicial foi recusada pela revisão automática por ausência de verificação independente do host. A exportação não ocorreu por SSH. A chave foi revogada; a alternativa utiliza o Console/Files do painel autenticado no perfil QuebraNunca.

A cópia local foi concluída: arquivo custom de 675.497 bytes, modo 0600, SHA-256 `27e193a867d77b6799848fa1efc05020312e979e4fcb09bc1e0167e5a3177e3c`, idêntico ao hash no servidor. `pg_restore --list` validou 349 entradas em PostgreSQL 18 offline; não foi realizada restauração integral. O temporário remoto foi removido e conferido ausente. O dump permanece exclusivamente em `.runtime.local/release-backup/` no checkout operacional, fora do Git. O manifesto local é `outputs/production-local-backup-2026-10-13.json`. A API e a web de produção foram promovidas após essa validação, nessa ordem, ambas com sucesso. O predeploy permanece `dotnet LongBeach.Api.dll --migrate-only`, em uma execução controlada; o bootstrap de dados fictícios é exclusivo da homologação.

## Produção publicada e conferida

- API: `10c7ee49-1f6a-4818-a244-aaf553684d76`, SUCCESS.
- Web: `04ae3436-97c1-4565-b761-1df716fe7dfd`, SUCCESS; imagem `sha256:b40408c7affee9ae4733798392660b0343d36f96798eb54e1ad595758d12ed36`.
- Os quatro serviços (API/web de Production/Staging) apontam para o mesmo commit `d1d3dd8`. A comparação confirmou que configuração fora da fonte e nomes das variáveis foram preservados. Cada patch de produção alterou somente branch/commit do serviço correspondente.
- Readiness da API e health da web retornaram 200. A consulta financeira anônima e uma notificação vazia sem assinatura retornaram 401. Google continuou configurado; `homologationLoginEnabled=false` em produção.
- A sessão Google autorizada foi conferida no Chrome. A visão financeira retornou quatro lançamentos internos sem pendências, R$ 26 nas duas comandas (relatório de origem: R$ 18 + R$ 8), caixa aberto com R$ 0 e carteira EDI de 12/10 coletada em 13/10 às 17:54:30 BRT. O saldo atual da conta permaneceu não conectado. Nenhum erro no console da página.
- Snapshot `.railway/railway.ts` sincronizado com Production. `railway config plan` retornou `No changes.`, zero alterações, diagnósticos vazios e nenhuma mudança staged. O estado final do projeto não apresentou avisos, críticos ou falhas recentes.
- O Chrome recebeu a atualização do PWA pelo botão existente “Atualizar agora”. Usuários com a versão anterior aberta podem precisar usar esse aviso.

Evidências locais: `outputs/longbeach-publicacao-2026-10-13.json` e `outputs/longbeach-financeiro-producao-2026-10-13.png`. Somente metadados de validação entram neste runbook; o dump e os arquivos privados permanecem ignorados.

## Retorno

Versões anteriores de produção: API `5ce7cbf35c757b4cf8c41c6f8c3758e4cb795e4d`, deployment `67349c91-372b-4fbd-ab2a-603d0191fbdb`; web `6cbdd1a3e406edb27dbbf4f46377a85a84b639e7`, deployment `a6770c1e-084b-4ddd-a8ec-947e2667c143`, branch `codex/comandas-saldo-20261013`.

Preferir correção para frente e, se necessário, retorno apenas da web. A migration `SubscriptionCreationRecovery` é aditiva, atualiza a marcação de assinaturas existentes e recria índice; não possui Down suportado. Não reverter a API sem revisar compatibilidade de estados de assinatura criados depois da migração. Preservar as transações confirmadas e nunca substituir produção pela base de homologação.

## Pendências externas

A promoção do código não equivale à aprovação oficial do PagBank. Homologação: `1464242238`, sucedendo o pedido de acesso do `1459066548`; suporte de estorno/recorrência: `1464208386`; EDI ativado: `1457129394`. O histórico EDI autorizado começa em 01/09/2026. Ver o runbook de homologação para os logs corrigidos e o resultado real do estorno.
