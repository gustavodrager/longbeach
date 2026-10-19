# Compras do Bar — publicação e validação, 19/10/2026

Cinco pontos de UX publicados em produção após CI aprovada. Revisão: https://github.com/gustavodrager/longbeach/pull/40.

## Comportamento

- Lista com pendências primeiro, pesquisa por fornecedor/documento, filtros A receber/Parciais/Concluídas e paginação no servidor. Compras antigas pendentes não ficam escondidas pelo limite anterior de 100 registros. Detalhes e correção do pagamento ficam em uma seção secundária.
- Nova compra com pesquisa por nome/código (nomes de produtos aceitam busca sem acentos), somente produtos ativos estocáveis, sem duplicar linhas. Enter na quantidade avança ao custo; Enter no custo volta à busca. Fornecedor pode ser cadastrado no próprio formulário, preservando itens.
- Unidade de compra e conversão explícitas, quantidade e custo editáveis, subtotais e total. Total exato do comprovante é opcional e valida a tolerância de arredondamento do domínio. Valores aceitam vírgula/ponto, quantidade com três casas e moeda com duas.
- Data de hoje em São Paulo, editável. Frete, desconto e referência de pagamento recolhidos. Rodapé fixo com total e ação; painel amplo no desktop e largura completa em celular.
- Registrar compra não movimenta estoque. A confirmação oferece “Receber esta compra”. Recebimento abre com o saldo restante, apresenta comprado/recebido/falta e permite parcial; vazio/zero pula o item. Entrada só ocorre na confirmação explícita. Usa conversão congelada na compra, inclusive se o cadastro atual mudar ou ficar inativo.

## Integração

Novas leituras protegidas por `bar:purchases:manage`: `GET /api/v1/bar/purchases/history`, `/purchases/products` e `/purchases/{id}`. O endpoint anterior de listagem e os contratos de escrita permanecem disponíveis. Sem migration.

API publicada antes do frontend, pois a tela depende das novas leituras. Rollback pode restaurar o frontend anterior mantendo a API compatível. Integração por `?invoice=` com Notas Recebidas preservada.

Formulários mantêm valores em erro e bloqueiam submissão simultânea. O recebimento conserva a mesma chave de operação na repetição do mesmo payload. Cadastro de compra mantém o contrato existente, sem acrescentar uma nova garantia de idempotência em falhas de rede com resposta perdida.

## Evidências

- Build API: sucesso, sem erros. Build frontend: sucesso.
- Suíte frontend final: 382 testes passaram em 42 arquivos, incluindo falha e repetição do recebimento.
- Backend: 53 testes passaram, sem ignorados, incluindo autorização, compras/recebimento em PostgreSQL e histórico com 106 compras, pendência antiga, filtros antes da paginação e consulta individual. NuGet emitiu aviso NU1900 de indisponibilidade da consulta de vulnerabilidades; compilação e testes concluíram.
- Chrome com API real e PostgreSQL exclusivamente fictício: desktop 1470×900, celulares emulados 320×740 e 390×844. Formulário, lista e recebimento sem overflow horizontal do documento/painel; inputs de 48 px, `inputmode=decimal`, foco/rolagem e ações visíveis.
- Fluxo real local: busca por código em catálogo com mais de 100 produtos; Enter quantidade→custo→busca; cadastro de fornecedor sem perder linhas; compra de 2,5 caixas a R$24,90 = R$62,25; recebimento de 1,5 caixa gera 18 unidades no Bar e deixa 1 caixa pendente. API confirmou os valores persistidos; reabertura exibe somente o saldo restante.
- Simulações automatizadas: requisição pendente bloqueia duplo envio; falha mantém valores; repetição de recebimento mantém operationId; excesso e vazio bloqueiam confirmação quando nada válido resta; produto inativo em compra histórica continua recebível com conversão original.
- Teclado virtual físico não foi validado: emulação confirma tamanho e atributo decimal, não comportamento de um aparelho real.

Capturas locais fora do repositório: `../../artifacts/compras-ux-20261019/`.

## Publicação em produção

- Commit de aplicação imutável: `ec6d867b3f3a2529b318caffe4385d65d24abcd3`, branch `codex/compras-bar-ux-20261019`, API e web.
- CI [39283034234](https://github.com/gustavodrager/longbeach/actions/runs/39283034234): sucesso; 340 testes unitários, 306 de integração em cada PostgreSQL 17/18, 382 frontend e 14 conversores, builds e verificações operacionais.
- API: deployment `2c71a04f-02ef-42b6-af80-2851432476de`, SUCCESS em 19/10/2026 16:39:34 UTC.
- Web: deployment `345545c0-4344-4331-bc2c-d746bbf90c68`, SUCCESS em 19/10/2026 16:52:43 UTC. Bundle público `index-CthK_GIB.js`.
- API `/health/ready`: Healthy; web `/healthz`: ok; histórico anônimo retorna 401. Snapshot Railway importado após cada publicação, sem alterações pendentes.
- Conferência autenticada em produção: lista e busca por fornecedor, filtro de pendências vazio, formulário com produto, decimal 1,5 × 2,00 = 3,00, Enter quantidade → custo → busca e abertura do cadastro de fornecedor preservando o item.
- Desktop 1470×900; celular emulado 390×844 e 320×740: sem overflow horizontal, inputs de 48 px com inputmode decimal, rolagem e rodapé visíveis. Sem erros de console capturados. Teclado físico não testado.
- Rascunho descartado pela confirmação de alterações não salvas; nenhuma compra, fornecedor ou entrada de estoque criada em produção. Recebimento completo/parcial validado no banco fictício e na CI; produção não tinha compras pendentes para exercitar essa escrita.
- Evidências privadas fora do Git: `../../outputs/compras-producao-2026-10-19/` (desktop, formulário desktop e celulares 320/390).

## Retorno

Restaurar primeiro a web ao commit `077181e87f7cda2a94f635f530f694f1e98dbb16` (deployment anterior `ec0229a7-f178-4f53-82ee-33c3da600599`). A API nova é compatível e pode permanecer. Se necessário, restaurar também a API ao mesmo commit (deployment anterior `58c0a287-1d8a-4e3f-bb57-1c94fdfc5e98`). Sem migration ou restauração de banco; preservar movimentos reais. Conferir saúde e sessão autenticada após retorno.
