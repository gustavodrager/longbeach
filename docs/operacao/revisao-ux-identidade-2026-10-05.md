# Revisão global de UX/UI — 2026-10-05

## Identidade e experiência

Toda a aplicação usa a assinatura vetorial oficial, Manrope local, areia `#F2E8D8`, preto `#171717` e amarelo `#F5BE3D`. A navegação administrativa está organizada em Arena, Estrutura, Bar e Administração. O atendimento mantém Vender, Comandas, Pedidos e Meu caixa; usuários autorizados podem voltar diretamente à gestão também no celular.

O painel apresenta prioridades atuais, resultados com período e áreas da arena. Cada indicador tem acesso à sua composição. Agenda, Escola, Financeiro, Alunos, Equipe, Materiais, Projetos e Manutenção compartilham filtros legíveis, listas com contagem, fichas e ações. A revisão visual cobriu computador de 1280 px e celular de 390 px, sem substituir um ensaio em aparelho Android real.

No atendimento, a venda explicita Escolher, Conferir e Receber. O catálogo usa Todos quando não existem favoritos. Quando há vários locais, uma escolha válida é necessária antes de mostrar disponibilidade; a preferência e o pedido são preservados por usuário. Comandas existentes mantêm seu próprio local.

## Correções verificadas

- A aprovação manual de cartão pertence ao valor, meio e parcela exibidos. Alterá-los ou atualizar o saldo exige nova confirmação na maquininha.
- Pedidos aguardando aceite não aparecem como Tudo pago; impedem oferecer encerramento prematuro.
- Reservas de hoje e seu detalhe usam a mesma composição, excluindo cancelamentos, bloqueios e aulas.
- Despesas vinculadas à manutenção preservam origem e retorno à ficha.
- Tarefas são editadas por identidade; remover uma tarefa não transfere sua conclusão a outra.
- Leituras operacionais são atualizadas ao voltar à janela, recuperar conexão e a cada 30 segundos enquanto visível. Leituras antigas não sobrescrevem uma escrita posterior; falhas preservam contexto, registros e horário anterior com aviso visível.
- O horário global representa uma leitura completa, sem ser renovado por um salvamento isolado.

## Validação

Em 2026-10-05 passaram 132 testes de frontend e 184 testes .NET (76 unitários e 108 de integração, incluindo PostgreSQL 17 real). Build web/PWA, publicação Release da API e sincronização Capacitor Android/iOS passaram. A revisão visual corrigiu contraste do título no painel e organização das ações no celular.

Não foram gerados APK/IPA assinados nem realizadas sessões com cinco atendentes. A confirmação real de Pix depende da configuração e homologação do provedor. A prioridade global da fila de pedidos ainda usa a paginação por comanda e exige uma consulta própria na API.

## Fonte e promoção

A revisão publicada em 2026-10-04 estava preservada no commit local `50d2234`, mas os serviços oficiais foram substituídos em 2026-10-05 pelo commit GitHub `933161b`, que não continha as novas telas. O código local e o repositório conectado possuem históricos Git independentes. A integração foi preparada sobre a fonte GitHub corrente, preservando Google, staging e a correção `reference-data` de importação.

A promoção utiliza `codex/ux-identidade-global-20261005` em `gustavodrager/longbeach` para os serviços oficiais `api` e `web`. Os demais serviços e domínios permanecem na fonte anterior. A configuração de cada serviço no ambiente Production precisa conter branch e commit fixados, além do trigger em nível de serviço. A integração com `main` fica registrada em pull request; futuras promoções devem escolher uma revisão validada e sincronizar o snapshot Railway.

O snapshot foi importado antes da alteração, com plano sem drift. Credenciais, conta Google autorizada, conexão e demais dados pessoais ficam em `preserve()`. A mudança planejada é somente a fonte de `api` e `web`; não é autorizada a remoção de nenhum serviço.

O schema da revisão é o já promovido em 2026-10-04; esta rodada não acrescenta migration. O pre-deploy controlado continua `dotnet LongBeach.Api.dll --migrate-only`. Dados operacionais e lotes importados não são recriados ou aplicados ao promover a interface.

## Publicação confirmada

Em 2026-10-05, API e web concluíram a promoção com `SUCCESS` no commit GitHub `b31701a6190d7ba71db191914d9a33b152e95d91`, branch `codex/ux-identidade-global-20261005`. A integração com `main` está no draft [PR #7](https://github.com/gustavodrager/longbeach/pull/7). O CI [37359307535](https://github.com/gustavodrager/longbeach/actions/runs/37359307535) passou nos dois jobs.

| Serviço | Deployment | Digest da imagem publicada |
| --- | --- | --- |
| API | `082f03d5-4b54-4d34-ac60-4583d4348d83` | `sha256:0e5ff5a751340cd761913f8b8dbcd464ea75882714848beb12f942ad42fdd678` |
| Web | `56d1cb1d-22fd-46d0-b10b-1b1de5dc0dba` | `sha256:78a1013690bdb7a6c4bba99aed33a40098c05087b0d49cde4ce26ada848ccc84` |

O pre-deploy confirmou que o banco já estava atualizado, sem aplicar migrations. `/health` e `/health/ready` da API e `/healthz` da web responderam `200`; comandas, receitas, dashboard do bar, operações e importações retornaram `401` sem autenticação. Os três serviços auxiliares e PostgreSQL mantiveram seus deployments anteriores.

O domínio oficial entrega `/assets/index-go58ZWZS.js` e `/assets/index-CPn9vPjC.css`; o bundle aponta para a API oficial, sem endereço localhost. No navegador autenticado, o aviso **Atualização disponível → Atualizar agora** substituiu a versão anterior. Foram conferidos logo, Manrope, contraste, navegação global, indicador de reservas abrindo Agenda com os filtros correspondentes, Escola, retorno da gestão ao atendimento e seletor de local. Em 390 × 844 px não houve excesso horizontal e o seletor tem 56 px. Os lotes `fonte-0.xlsx` (80 linhas) e `fonte-1.xlsx` (1.031 linhas) continuam pendentes de conferência; nenhuma venda, cobrança ou aplicação de lote foi executada nessa verificação. Evidência: `revisao-ux-producao-2026-10-05.jpg`, sem dados pessoais.

### Correção da fonte no ambiente Railway

Os comandos CLI `service source connect` confirmaram a branch de revisão nos triggers, e os deployments confirmaram branch, commit e digest. A configuração do ambiente continuava somente com `source.repo`, sem `source.branch`. A hipótese inicial de limitação da exportação foi invalidada em 2026-10-05: uma atualização automática de variável escolheu `main` (`aff1086e-da34-46c3-b9b5-f948439b31b8`). Essa revisão foi retirada, causando uma interrupção da API até a recuperação; a API foi recuperada no deployment `b2109811-827a-441a-95bb-4d1b7f69fa08`, commit `96407c386f6573b22465648921bf0bf85b4147c2`.

A correção foi feita por patches não destrutivos e revisados de fonte no ambiente Production, contendo `source.branch` e `source.commitSha`. `describe-service` passou a devolver ambos os campos. A web também foi fixada na revisão UX `b31701a6190d7ba71db191914d9a33b152e95d91`, deployment `35d5b559-cb7d-4634-800d-2eb886531ddd`. Mantenha fontes independentes para API e web no snapshot e exija correspondência entre configuração do ambiente, commit e digest publicados; um trigger ou último deployment correto isolado não prova a fonte usada em atualizações automáticas. `github(repo)` sem branch assume `main` no SDK 3.12.0.

## Retorno

Em falha, retornar aos deployments anteriores de API e web e manter banco e migrations aplicadas. Não executar migrations Down. Preservar a revisão GitHub e só alterar a fonte depois de conferir o plano e a saúde dos serviços. O sistema legado continua fora desta alteração.

## Inclusão individual de Owner e auditoria

A inclusão individual autorizada em 2026-10-05 foi confirmada por consulta ao PostgreSQL de Production em transação `READ ONLY`, no deployment `573b6c4f-d827-4287-80d9-0f308527e55f`, às 19:58:35 UTC: 1 alvo, 1 conta ativa com Owner, 0 concessões de Owner fora do alvo durante a janela da atualização e resultado aprovado. Os e-mails reais não são versionados. A allowlist mantém as três contas anteriores e a conta solicitada.

O cadastro direcionado foi publicado no commit `96407c386f6573b22465648921bf0bf85b4147c2`; a verificação de leitura está em `b779492defc0611fbb4ccb4e7b135c0c763deb84`. A suíte local Release passou com 214 testes .NET (76 unitários e 138 integração), sem falhas ou ignorados. O CI `37364275888` do cadastro direcionado passou; o CI `37366621014` da verificação ainda estava em fila às 20:01 UTC.

A configuração final restaurou `--migrate-only`, manteve as flags de provisionamento, seed e bootstrap de senha desativadas e removeu os três controles temporários de alvos/janela. O deployment final da API `5c7654ac-c231-4c06-90e3-2426586925a7` concluiu com `SUCCESS`, commit `b779492defc0611fbb4ccb4e7b135c0c763deb84`, digest `sha256:8c5f7e2e79e70300de69b17800c3fed329b5d90b15c7273144c9c4f723fb9480`; nenhuma migration nova foi aplicada e nenhum provisionamento foi registrado nessa inicialização. Web permanece fixada em `b31701a6190d7ba71db191914d9a33b152e95d91`, deployment `35d5b559-cb7d-4634-800d-2eb886531ddd`. API readiness, web health e login responderam `200`; a web conserva os assets da revisão UX. O plano Railway ficou sem alterações após a limpeza.

O `400 origin_mismatch` informado no login exige conferir a origem `https://longbeach.quebranunca.com.br` em Authorized JavaScript origins do cliente OAuth Web no Google Cloud. O client ID do bundle corresponde à configuração da API. Não foi alterado o cadastro do cliente Google Cloud nem validado login com a nova conta; o papel Owner não elimina esse bloqueio anterior à autenticação.
