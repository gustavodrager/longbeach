# Compras do Bar — validação local, 19/10/2026

Implementação local dos cinco pontos de UX. Este incremento ainda não foi enviado ao GitHub nem publicado.

## Comportamento

- Lista com pendências primeiro, pesquisa por fornecedor/documento, filtros A receber/Parciais/Concluídas e paginação no servidor. Compras antigas pendentes não ficam escondidas pelo limite anterior de 100 registros. Detalhes e correção do pagamento ficam em uma seção secundária.
- Nova compra com pesquisa por nome/código (nomes de produtos aceitam busca sem acentos), somente produtos ativos estocáveis, sem duplicar linhas. Enter na quantidade avança ao custo; Enter no custo volta à busca. Fornecedor pode ser cadastrado no próprio formulário, preservando itens.
- Unidade de compra e conversão explícitas, quantidade e custo editáveis, subtotais e total. Total exato do comprovante é opcional e valida a tolerância de arredondamento do domínio. Valores aceitam vírgula/ponto, quantidade com três casas e moeda com duas.
- Data de hoje em São Paulo, editável. Frete, desconto e referência de pagamento recolhidos. Rodapé fixo com total e ação; painel amplo no desktop e largura completa em celular.
- Registrar compra não movimenta estoque. A confirmação oferece “Receber esta compra”. Recebimento abre com o saldo restante, apresenta comprado/recebido/falta e permite parcial; vazio/zero pula o item. Entrada só ocorre na confirmação explícita. Usa conversão congelada na compra, inclusive se o cadastro atual mudar ou ficar inativo.

## Integração e implantação futura

Novas leituras protegidas por `bar:purchases:manage`: `GET /api/v1/bar/purchases/history`, `/purchases/products` e `/purchases/{id}`. O endpoint anterior de listagem e os contratos de escrita permanecem disponíveis. Sem migration.

Publicar API antes do frontend em uma futura entrega autorizada, pois a tela depende das novas leituras. Rollback pode restaurar o frontend anterior mantendo a API compatível. Integração por `?invoice=` com Notas Recebidas preservada.

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
