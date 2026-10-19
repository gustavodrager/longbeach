# Comandas e cadastro de produtos — 19/10/2026

Comandas agora oferece ações diretamente na lista, abertura diretamente no catálogo, busca automática de responsável, layout compacto, ações móveis e saldo total pré-selecionado no recebimento. A lista reconsulta ao retornar, mesmo dentro da janela de cache global. Confirmação de vínculo, permissões, pagamentos e bloqueios de encerramento são preservados.

Produtos apresenta nome, categoria, preço e unidade; os demais campos ficam em Mais opções. A API gera código interno quando vazio e preserva códigos existentes. O formulário usa o nome como nome no PDV e a unidade de venda como unidade de compra quando não informados. Nenhuma migration nova.

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
