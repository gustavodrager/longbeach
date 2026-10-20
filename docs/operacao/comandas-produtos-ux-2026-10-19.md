# Comandas e cadastro de produtos — 19/10/2026

Comandas agora oferece ações diretamente na lista, abertura diretamente no catálogo, busca automática de responsável, layout compacto, ações móveis e saldo total pré-selecionado no recebimento. A lista reconsulta ao retornar, mesmo dentro da janela de cache global. Confirmação de vínculo, permissões, pagamentos e bloqueios de encerramento são preservados.

Produtos apresenta nome, preço e unidade; categoria e os demais campos ficam em Mais opções. Categoria não escolhida usa Sem categoria automaticamente, com criação serializada e auditada; a edição preserva a categoria enviada pelo formulário. A API gera código interno quando vazio e preserva códigos existentes. O formulário usa o nome como nome no PDV e a unidade de venda como unidade de compra quando não informados. Nenhuma migration nova.

## Publicação

- Revisão: https://github.com/gustavodrager/longbeach/pull/42, sobre a versão publicada de Caixas.
- Commit da aplicação: `c2ee5583cfabd65e2fd5b345f7122593024b793e`, branch `codex/comandas-produtos-ux-20261019`.
- CI `39326312294`: aprovada; 340 testes unitários, 310 integração em PostgreSQL 17 e 18, 394 frontend, builds, readiness, auditoria e restauração fictícia.
- API: `f4915774-b196-4836-9838-c36b1d99c80d`, SUCCESS. Publicada antes da interface; `/health/ready` Healthy.
- Web: `b960644d-f50f-4d6d-ac12-2d5c03024524`, SUCCESS; `/healthz` ok e Comandas HTTP 200.
- Consulta anônima de produtos: 401.
- As fontes dos dois serviços estão fixadas no commit aprovado; somente branch e commit foram alterados. Sem patch pendente; snapshot reconciliado, plano sem diferenças.

## Validação

Local: 394 testes frontend, 74 testes afetados da API com PostgreSQL fictício, builds API/frontend. Chrome desktop e 320/390 px, com abertura, consumo, recebimento e encerramento; produto fictício salvo e reaberto, código automático persistido.

Produção: sessão autenticada no Chrome com PWA atualizada, desktop e celular emulado em 320/390 px. Conferidos atalhos, detalhe, abertura sem enviar, saldo total pré-selecionado, campo de dinheiro e botão final alcançáveis por rolagem, cadastro com quatro campos e expansão de Mais opções. Nenhum consumo, pagamento, encerramento ou produto real foi gravado. A conferência móvel foi emulada, sem teclado físico de aparelho.

Evidências visuais locais: `outputs/comandas-produtos-producao-2026-10-19/` no workspace pai, fora do Git por conter interface real.

## Reversão

Voltar primeiro a web e depois a API: o novo formulário envia código vazio, aceito pela API nova. Revisão anterior compatível: `8e1eb31608dec8b6e5a921e11f912fe58e962e7f`, branch `codex/caixas-bar-ux-20261019`; API `0dea9412-0758-4644-bc86-a4aff5b8227a`, web `879eea5e-71cb-456e-98fb-5c1e588603a2`. Preservar produtos e transações; não remover dados. Reconciliar snapshots e conferir saúde após qualquer reversão.


## Ajuste de categoria opcional — publicação de 19/10/2026

- Commit da aplicação: `11689011ff7bd0ec6ece7db333e4378d9bc3bd79`, na mesma branch e revisão #42.
- CI `39339598211`: aprovada; 397 testes frontend, 340 unitários e 313 integração em cada PostgreSQL 17/18, 14 conversores, builds, readiness, auditoria e restauração fictícia.
- API `5b617965-1fb1-4be6-82b5-72575750c3c2`: SUCCESS, publicada antes da web; health/ready 200 Healthy.
- Web `e07fe374-967f-4727-81ae-2eb820777c78`: SUCCESS; healthz 200 ok. Catálogo sem sessão continua 401.
- Somente o commit de origem dos dois serviços foi promovido. Snapshot importado após cada etapa e plano sem divergências. Nenhuma migration nova.
- Produção: PWA atualizada na sessão de gestão; cadastro com três campos conferido no desktop (1440 px), 320 e 390 px. Mais opções mostra categoria opcional com Sem categoria selecionada, uma única opção padrão e seletor de 56 px. Sem rolagem horizontal; rodapé e campos alcançáveis por rolagem. Produto existente abriu com sua categoria original. Nenhum produto real foi criado ou alterado na conferência.
- Gravações, reabertura, escolha/remoção de categoria, edição com opções recolhidas, concorrência e rollback foram validados no banco local fictício e nos testes automatizados. A validação móvel foi emulada, sem aparelho físico.
- Evidências privadas fora do Git: `outputs/categoria-produtos-producao-2026-10-19/` no workspace pai.

Reversão deste ajuste: voltar primeiro a web para `c2ee5583cfabd65e2fd5b345f7122593024b793e` (deployment `b960644d-f50f-4d6d-ac12-2d5c03024524`). Se necessário, voltar depois a API ao mesmo commit (deployment `f4915774-b196-4836-9838-c36b1d99c80d`). A web nova envia categoria nula e depende da API nova. Preservar produtos e a categoria criada; não remover dados. Reconciliar snapshot e verificar saúde.

## Pedidos e publicação conjunta com C6 — 19/10/2026

Pedidos agora agrupa itens por comanda, com busca por número, nome ou produto e filtros Todos, A aceitar e A entregar antes da paginação. Aceite e entrega em um toque, recusa contextual com motivo, processamento e nova tentativa por item. Respostas concorrentes confirmam somente o item da ação. Layout responsivo preserva nomes longos e controles de toque.

Por autorização explícita do responsável, a versão integra também C6, mantendo conexão, saldo/extrato e Pix desabilitados. Evidências de backup, migrations e limites em [validação C6](c6-validacao-2026-10-19.md).

- Artefato conjunto: `b7c57a87e2acab7cbab227d70fb8b0b3509befd5`, revisão #42.
- CI `39348393971`: frontend e backend PostgreSQL 17/18 aprovados, incluindo builds e verificações operacionais. Pedidos havia passado localmente em 403 testes frontend e 70 testes de integração afetados.
- API `f5251d2d-393d-49f5-adc6-586750e0c611` e web `13084b44-cf2e-4f5b-9926-e14ba6cff374`: SUCCESS, ambas com meta.commitHash do artefato conjunto. API publicada antes da web; health/ready Healthy e healthz ok. Pedidos anônimo retorna401.
- Snapshot Railway reconciliado, plano sem diferenças; somente branch/commit de API/web promovidos.
- Produção autenticada com PWA atualizada: desktop1440px, celular emulado320/390px, busca, filtros e limpeza conferidos, sem rolagem horizontal; controles medidos em55px. Fila vazia durante a conferência: ações com itens foram verificadas localmente em banco fictício, inclusive aceite, entrega, recusa e persistência após recarregar, além de concorrência e falha/nova tentativa automatizadas. Nenhuma transação real criada.
- Diagnóstico financeiro confirma C6 Pix e saldo/extrato desativados. A publicação não representa homologação ou ativação bancária.
- Evidências privadas fora do Git: `outputs/pedidos-producao-2026-10-19/` no workspace pai.

Retorno de Pedidos: promover primeiro web e depois API para `def7e333cad951e3c004f56f5ae0a53f172f74ff` (web `e28c44ea-5018-48c3-9b67-4bcc13c5dbe5`, API `e297480d-3b88-41ce-a6b8-504730f14a3e`). Essa versão já compreende o schema C6. Não reduzir schema nem remover dados; seguir as guardas C6 para pagamentos e configuração.
