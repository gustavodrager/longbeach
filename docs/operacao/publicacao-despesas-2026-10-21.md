# Preparação da publicação de Despesas e pagamentos — 21/10/2026

## Situação

Publicação autorizada explicitamente pelo proprietário no chat. **Ainda não publicada.** Não houve migration, alteração de fonte no Railway ou lançamentos de teste em produção nesta preparação.

O incidente oficial [QH8L8B3E](https://status.railway.com/incident/QH8L8B3E) informa indisponibilidade do painel/API e suspensão de builds/deployments. A atualização de 16:29 UTC de 21/10 mantém a suspensão. A aplicação já publicada continua respondendo aos probes.

## Versão e validação

- Aplicação aprovada: `2d03d467119915325a4f7c31c5cb7368951c828a`, branch `codex/financeiro-despesas-20261021`, [PR #45](https://github.com/gustavodrager/longbeach/pull/45).
- Validação local: 465 testes frontend, 439 unitários, 356 integrações PostgreSQL 18 e 14 integrações focadas PostgreSQL 17 aprovados. Builds API Release/PWA e conferência no navegador com dados fictícios aprovados.
- [CI 39638384385](https://github.com/gustavodrager/longbeach/actions/runs/39638384385) aprovada para o commit de aplicação: 439 unitários, 356 integrações em PostgreSQL 17 e 18, 465 frontend e 14 conversores, sem falhas ou testes ignorados. Builds, migration/readiness, auditoria somente leitura e restauração sintética também aprovados. A última etapa terminou às 16:58:44 UTC.
- Snapshot importado por `config pull --variables=managed`, sem exportar valores privados. SDK da configuração atualizado de 3.12.0 para 3.16.0 para reconhecer o CDN existente. `config plan --detailed-exit-code` terminou com saída 0 e configuração atualizada, sem alterações propostas. Commit separado da infraestrutura: `397d4d8`.

## Referências de produção antes da mudança

Ambiente `production` (`e32774e4-b03e-4a1f-bae7-3e79263f76d9`), projeto exclusivo `longbeach-os` (`b88a93d7-6964-4ac5-9590-7cef49598cf0`). Seis serviços online, sem trabalho pendente ou falhas recentes na primeira leitura.

| Serviço | Fonte fixada na configuração | Deployment ativo |
|---|---|---|
| API | `4c6a7a0afd46ee8f5f8ecf6f3a186465a608a723` | `1bd3033e-91d8-40d0-baef-a172ebb54290` |
| Web | `42e5ac8338a921ad7dcf96dfa6065e264712c601` | `d5daa648-bb3b-4055-8225-f3ffd553a9bc` |

Ambas as fontes usam a branch `codex/bar-tablet-20261020`. O metadado do deployment web ativo aponta `51dd711271c313217c9bbac61d0fcc4c91982bcb`, anterior à fonte fixada no ambiente; preservar essa distinção ao registrar retorno, sem presumir nova implantação do commit configurado. O manifesto geral anterior está desatualizado e não comprova o estado desta publicação.

Antes da mudança, `/health/live`, `/health/ready` e `/healthz` responderam 200. A consulta financeira sem sessão respondeu 401. CORS permitiu a origem oficial com credenciais e não autorizou localhost. A sessão administrativa existente abriu a Visão geral sem alteração de dados.

## Backup e autorização de acesso

É necessário um backup fresco antes da migration aditiva de comprovantes. O acesso SSH anterior não possui chave privada disponível neste ambiente. A revisão automática inicialmente recusou o cadastro de uma nova chave temporária, por ampliar o acesso à produção além da autorização de publicação.

O proprietário depois autorizou explicitamente cadastrar uma chave temporária para esta publicação, usá-la no backup/conferência do PostgreSQL do LongBeach e revogá-la ao terminar, com a cópia no servidor. A chave foi cadastrada em agente isolado; a tentativa de conferir as ferramentas pelo SSH oficial ficou sem resposta durante o incidente e foi interrompida antes de qualquer comando de backup. Não houve backup novo, migration ou consulta aos dados do banco.

A chave foi revogada com sucesso; o agente isolado foi encerrado e os arquivos privados locais apagados. A tentativa de usar o painel existente também encontrou o incidente e ausência de sessão Railway. O backup deve permanecer no servidor, sem dump em Git ou nos artefatos da revisão. A autorização específica recebida continua vinculada ao backup e à conferência desta publicação; a produção depende da recuperação do provedor.

## Retomada e retorno

1. Confirmar recuperação dos builds/deployments no Railway e conclusão aprovada da CI para o commit de aplicação.
2. Obter o backup autorizado e verificar listagem e decodificação; registrar tamanho/hash e limitações da recuperação. Não configurar backup recorrente nem exportar os dados para outro destino nesta tarefa.
3. Reconsultar fonte, configuração, variáveis públicas, deployments e patches pendentes. Preparar somente a mudança de branch/commit da API em Production, revisar o patch e promovê-lo com a autorização já recebida. Não aplicar um plano genérico de infraestrutura.
4. Manter o pre-deploy único `dotnet LongBeach.Api.dll --migrate-only`; startup migration/seed/bootstrap continuam desabilitados. Confirmar no log e na estrutura a migration `20261021154910_ExpenseAttachments`.
5. Conferir saúde, autenticação, CORS e leituras; somente depois promover a web no mesmo commit. Preservar banco, credenciais, CDN, domínios, integrações e serviços auxiliares.
6. Conferir a tela autenticada sem criar dívidas ou pagamentos fictícios em produção. Registrar deployments, digests, evidências e snapshot final sem drift; então atualizar o manifesto geral.

Após novas despesas ou pagamentos, preferir **retornar somente a web e manter a API compatível**. A API antiga não protege os metadados gerenciados nem interpreta as baixas parciais. Não executar a migration reversa, que remove os comprovantes. Não restaurar um backup sobre a operação corrente como retorno rotineiro.
