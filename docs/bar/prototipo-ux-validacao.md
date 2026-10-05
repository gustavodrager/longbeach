# Protótipo de UX/UI — Long Beach OS

Data: 04/10/2026. Etapa: protótipo navegável para validação com a equipe.

O protótipo está no aplicativo existente, em `/prototipo`. Demonstra atendimento, autoatendimento do cliente e gestão do bar antes da implementação operacional de comandas e pagamentos independentes. A referência arquitetural é o [ADR-004](../adr/ADR-004-bar-comandas-e-pagamentos-independentes.md).

**Ainda não foram coletados resultados de validação com pessoas.** As telas e a simulação devem ser avaliadas com cinco atendentes representativos. A implementação do novo conjunto operacional no backend depende dessa validação e das correções encontradas. Esta entrega não constitui aceite operacional ou autorização de publicação.

## Isolamento e preparação

- Todas as pessoas, produtos, comandas, pagamentos e valores da demonstração são fictícios.
- O estado usa somente o navegador, na chave `longbeach-ux-prototype-v1`; as operações demonstradas não chamam a API real, não gravam no banco e não alteram vendas históricas.
- Pix é uma simulação de estados. Não há cobrança, QR pagável, código Pix ou integração com provedor. Os links da experiência do cliente permitem testar a navegação; não equivalem a credenciais ou QR de produção.
- Os rascunhos das telas ficam em armazenamento de sessão próprio do protótipo. Nome, e-mail e documento do pagador Pix são dados transitórios do formulário e não entram no histórico de pagamentos ou no registro de idempotência.
- Em **Testar situações**, é possível trocar entre Marina, Rafael e Supervisão, simular falta de internet, reiniciar os dados e controlar uma resposta Pix fictícia. A confirmação Pix exige Supervisão; essas ferramentas não aparecem na experiência do cliente.
- **Recomeçar demonstração** restaura as fixtures e limpa somente os rascunhos deste protótipo. Não limpa autenticação, cadastros ou dados de outros módulos.
- Uma segunda aba do mesmo navegador e da mesma origem pode acompanhar atualizações por armazenamento local. Não há sincronização entre aparelhos.

Antes de cada sessão, reiniciar os dados, desligar a falta de internet simulada e selecionar Marina. Usar prioritariamente um Android em orientação vertical, com o tamanho de texto habitual do participante. Não usar dados pessoais nem dinheiro real.

## Experiências e rotas

| Experiência | Rotas | Finalidade |
|---|---|---|
| Atendimento | `/prototipo/vender` | Escolher produtos, alterar quantidades e conferir o pedido. |
| Atendimento | `/prototipo/comandas`, `/prototipo/comandas/:accountId` | Abrir visitante sem cadastro, localizar comanda e acompanhar seus quatro valores. |
| Atendimento | `/prototipo/pedidos` | Aceitar, recusar e entregar itens. |
| Atendimento | `/prototipo/receber/:accountId` | Receber tudo ou uma parte, depois escolher o meio e confirmar. |
| Atendimento | `/prototipo/caixa` | Abrir, colocar dinheiro, retirar dinheiro e fechar o próprio caixa. |
| Supervisão de caixa | `/prototipo/caixa?sessionId=:sessionId` | Conferir uma sessão identificada e resolver diferença com motivo. |
| Comprovante | `/prototipo/comprovante/:paymentId` | Consultar o pagamento específico, valor, meio e troco. |
| Cliente | `/prototipo/cliente/:accessId` | Pedir, acompanhar a própria comanda e simular pagamento parcial ou integral por Pix. |
| Gestão | `/prototipo/gestao` | Atenção agora, resultados no período e áreas da arena. |
| Gestão | `/prototipo/gestao/detalhes/:metric` | Lista dos registros que compõem um indicador; dez registros por página. |
| Gestão | `/prototipo/gestao/comandas/:accountId`, `/prototipo/gestao/pagamentos/:paymentId`, `/prototipo/gestao/caixas/:sessionId`, `/prototipo/gestao/estoque/:productId` | Consultar a ficha ou lançamento de origem. |
| Evolução | `/prototipo/gestao/fases/:phase` | Apresentar Agenda, Escola, Financeiro e Equipe como **Ainda não disponível**. |

Os filtros administrativos usam `from`, `to`, `page` e `metric` na URL. As datas inicial e final são inclusivas, no fuso `America/Sao_Paulo`. O retorno do registro à lista preserva o contexto dos filtros e da página.

As quatro opções fixas do atendimento são **Vender, Comandas, Pedidos e Meu caixa**. Gestão e cliente têm navegação própria. No protótipo, indicadores e custos administrativos exigem a pessoa Supervisão; acesso direto com atendente mostra a restrição. Escolher Gestão no seletor de experiências simula explicitamente esse perfil. A experiência do cliente apresenta somente a comanda associada ao acesso; número e nome não liberam outra conta.

## Regras demonstradas

- **Pedido e consumo:** pedido QR começa esperando a equipe, sem valor cobrável e sem reserva de estoque. Aceitação inclui o consumo no total e reserva a quantidade disponível. Recusa exige motivo e não gera consumo.
- **Entrega e estoque:** produto pronto lançado pela equipe pode ser registrado e entregue no mesmo passo. Produto preparado e pedido QR passam pela fila. Cada entrega baixa o estoque uma vez; receber dinheiro depois não produz outra baixa.
- **Valores da comanda:** Total, Já pago, Pagamento pendente e Falta pagar são separados. O valor disponível para uma nova cobrança desconta os Pix pendentes, evitando receber novamente a mesma parte do saldo.
- **Pagamento:** valores usam centavos inteiros e divisão por valor. Dinheiro exige o caixa aberto de quem recebe e registra troco; cartão exige a indicação de aprovação na maquininha; Pix só entra em Já pago após confirmação simulada pela Supervisão. Pix recusado preserva consumo e saldo.
- **Caixa:** cada atendente possui uma sessão aberta por vez. A diferença entre contado e esperado impede fechamento pelo atendente. Supervisão pode concluir a sessão identificada, registrando motivo. Pix e cartão não aumentam dinheiro físico no caixa.
- **Correção e estorno:** exigem Supervisão e motivo. A devolução de produto ao estoque é explícita. Retirar consumo coberto por pagamento ou Pix pendente exige resolver esses valores antes. Estorno em dinheiro usa somente o caixa original ainda aberto; um caixa fechado não é reescrito.
- **Encerramento:** comanda só fecha sem saldo, pagamento pendente ou item esperando confirmação/entrega. Fechamento revoga o acesso do cliente. O acesso fictício expira após 24 horas.
- **Repetição e interrupção:** cada comando guarda uma identificação da operação. Repetir a mesma intenção devolve a resposta original; reutilizar a identificação com outra alocação financeira falha. Falta de internet simulada não confirma nova operação, permitindo tentar novamente após restabelecimento.
- **Gestão:** o indicador e seus detalhes usam os mesmos registros. Consumo confirmado, recebimento bruto, estornos e taxas são distintos. Saldo bancário não é inferido a partir desses totais. Estoque disponível considera reservas; pedidos esperando a equipe são contados por linha de item.

## Fixtures iniciais

Os horários são criados no momento de reiniciar a demonstração. Para consultar os resultados iniciais, selecionar esse dia no painel administrativo.

| Fixture | Identificação | Situação inicial |
|---|---|---|
| Marina | `marina`, caixa `cash-marina` | Fundo de R$ 100,00 e pagamento de R$ 10,00 já recebido; dinheiro esperado de R$ 110,00. |
| Rafael | `rafael`, caixa `cash-rafael` | Fundo e dinheiro esperado de R$ 100,00. |
| Supervisão | `supervisor` | Autoriza correções, estornos, diferenças de caixa e o resultado Pix simulado. |
| Ana | Comanda 12, `account-12` | Água R$ 5,00, cerveja R$ 12,00 e batata R$ 10,00, entregues; total R$ 27,00, pago R$ 10,00, falta R$ 17,00. |
| Bruno | Comanda 8, `account-8` | Hambúrguer de R$ 25,00 solicitado por QR, esperando a equipe; total cobrável inicial de R$ 0,00. |
| Carla | Comanda 17, `account-17` | Suco R$ 8,00 e refrigerante R$ 7,00, entregues; total R$ 15,00, Pix pendente de R$ 15,00, nenhum pagamento confirmado. |

Links de cliente para a sessão local: `/prototipo/cliente/demo-access-12`, `/prototipo/cliente/demo-access-8` e `/prototipo/cliente/demo-access-17`. Esses identificadores são fixtures públicas, não segredos reais.

O catálogo contém sete produtos. Água com gás começa sem estoque. Refrigerante começa com três unidades e mínimo de seis; os dois produtos permitem testar falta e reposição. Os preços, custos, estoques e a taxa de cartão de 2% são valores demonstrativos; não representam a operação ou contratos comerciais reais.

## Roteiro com cinco atendentes

Selecionar cinco pessoas que representem a equipe e os níveis habituais de leitura e familiaridade digital. Tratar dificuldades como evidência de desenho da interface. Não identificar participantes por nome no relatório; usar A1 a A5.

Dar uma orientação curta e igual para todos: mostrar as quatro opções do atendimento e explicar que os dados são fictícios. Depois entregar cada tarefa em linguagem simples, sem ensinar a sequência de botões. O observador registra hesitações, toques, erros, tempo e necessidade de ajuda. Ao pedir ajuda, registrar a ocorrência antes de orientar. As tarefas de cliente e supervisor podem ser representadas pelo observador, sem orientar as escolhas do atendente.

Reiniciar os dados entre os cenários para permitir comparação. As ferramentas de simulação devem ser operadas pelo observador quando não fizerem parte da tarefa do participante.

| Cenário | Tarefa e preparação | Critério observado |
|---|---|---|
| 1. Venda com troco, quantidade e indisponibilidade | Em Vender, adicionar duas águas e corrigir para uma. Tentar selecionar água com gás sem estoque. Vender a água, receber R$ 10,00 em dinheiro e abrir o comprovante. | Uma unidade vendida por R$ 5,00, troco de R$ 5,00 e uma única baixa de estoque. Produto indisponível não entra no pedido. Participante encontra a confirmação e entende o troco. |
| 2. Mesma comanda, pagamento parcial e troca de turno | Na comanda 12, Marina recebe R$ 10,00 em dinheiro como uma parte dos R$ 17,00 restantes. Fechar seu caixa contando R$ 120,00. Trocar para Rafael e receber os R$ 7,00 restantes por cartão, após aprovação na maquininha simulada. | Comanda continua acessível após o fechamento de Marina. Cada pagamento identifica seu responsável; dinheiro entra somente no caixa usado. Total permanece R$ 27,00 e saldo termina em zero. |
| 3. Pedido QR aceito, recusado e entregue | Abrir a experiência de Bruno em outra aba. Na fila, aceitar e entregar o hambúrguer inicial. Pelo cliente, pedir um suco adicional; recusar esse novo item com motivo. | Antes da aceitação, hambúrguer não é cobrável. Após aceitação, total fica em R$ 25,00; entrega baixa uma unidade de hambúrguer. Suco recusado não aumenta consumo nem baixa estoque. Cliente compreende os estados. |
| 4. Pix pendente, recusado e confirmado após interrupção | Usar Carla, com Pix pendente. O observador, como Supervisão, simula a recusa. O cliente tenta outro Pix com dados fictícios, primeiro com falta de internet simulada e depois com conexão restabelecida. O observador confirma em outra aba administrativa. Recarregar a tela pendente para testar recuperação. | Recusa preserva R$ 15,00 de consumo e saldo. Tentativa sem conexão não cobra. Ao retornar, existe uma única tentativa registrada; confirmação aparece no cliente, sem nova baixa de estoque nem aumento de dinheiro em caixa. |
| 5. Caixa com diferença e encaminhamento | Marina tenta fechar o caixa inicial contando R$ 105,00. Após o pedido de ajuda à supervisão, o observador troca o papel e abre `/prototipo/caixa?sessionId=cash-marina`, registrando o motivo da diferença. | Atendente não consegue aprovar a divergência. Supervisão conclui a sessão correta e a diferença de −R$ 5,00 fica registrada. Recebimentos já confirmados permanecem preservados. |
| 6. Indicador, composição e origem | Na gestão, selecionar o dia das fixtures, abrir Consumo registrado, conferir as linhas e abrir a comanda de origem. Voltar à lista e ao painel. Repetir para recebimentos ou Pix pendentes. | Os detalhes somam exatamente o indicador. Participante distingue consumo de pagamento confirmado. Período e contexto permanecem no retorno; pedido de Bruno não compõe consumo enquanto não aceito. |
| 7. Limites de acesso | Tentar abrir caixa de Rafael enquanto Marina está selecionada, usando `/prototipo/caixa?sessionId=cash-rafael`. No cliente, tentar um acesso inexistente e repetir o acesso de uma comanda encerrada. Verificar gestão e custos com perfil de atendente. | A interface rejeita o caixa de outra pessoa, acesso inválido e comanda revogada. Informação administrativa não é disponibilizada ao atendente. Qualquer ausência de bloqueio deve ser registrada como falha; a avaliação não constitui prova de segurança de servidor. |

Na etapa administrativa, o observador pode assumir Supervisão. Ao testar o papel do atendente, não alterar seu perfil para contornar uma restrição. Para pagamento Pix, usar exclusivamente os dados fictícios do formulário.

### Registro de observações

Para cada célula, preencher: **sem ajuda / com ajuda / não concluiu**, tempo e referência do problema encontrado. Registrar separadamente duplicação, falsa aprovação, baixa incorreta ou exposição indevida.

| Participante | C1 | C2 | C3 | C4 | C5 | C6 | C7 | Observações |
|---|---|---|---|---|---|---|---|---|
| A1 | — | — | — | — | — | — | — | — |
| A2 | — | — | — | — | — | — | — | — |
| A3 | — | — | — | — | — | — | — | — |
| A4 | — | — | — | — | — | — | — | — |
| A5 | — | — | — | — | — | — | — | — |

**Aceite inicial:** pelo menos quatro dos cinco participantes concluem cada fluxo principal de atendimento sem ajuda, após a orientação curta. Deve haver zero cobranças duplicadas e zero indicações falsas de pagamento confirmado. Problemas de acesso, estoque ou caixa que comprometam a operação impedem o aceite até correção e nova verificação.

Os cenários administrativos e de cliente também precisam ter resultados registrados, com participação do observador nas autorizações previstas. O resultado humano está **pendente de coleta**. Aprovação de testes técnicos não preenche essa etapa nem autoriza assumir sucesso com os cinco participantes.

## Identidade visual e acessibilidade

- Marca vetorial extraída da **página 3** de `manual-identidade.pdf`, fornecido pelo usuário no workspace, e preservada nos arquivos `logo-horizontal.svg` e `logo-symbol.svg` em `app/public/prototype-assets/`.
- Paleta do protótipo: areia `#F2E8D8`, preto `#171717` e amarelo `#F5BE3D`.
- Fonte Manrope distribuída localmente com licença SIL Open Font License. A licença acompanha o asset em [`app/public/prototype-assets/OFL.txt`](../../app/public/prototype-assets/OFL.txt).
- Imagens de produtos são ilustrações provisórias para reconhecimento durante o teste. Trocar por fotos reais do catálogo antes da operação.
- Texto operacional próximo de 18 px, ações principais de 56 px e alvos de toque de pelo menos 48 × 48 px. Ícones acompanham palavras; estados usam texto e símbolo além da cor. Verificar essas escolhas em Android, com ampliação de texto e navegação assistiva.

## Limitações e evolução

O protótipo valida linguagem, organização e compreensão dos fluxos. Não implementa autenticação de produção, autorização de servidor por objeto, concorrência entre dispositivos, ledger persistente, transações PostgreSQL, webhook, assinatura de provedor, conciliação financeira, receitas de preparo ou emissão fiscal. O seletor de pessoas é uma ferramenta de demonstração, não um mecanismo seguro de identidade.

A proteção contra repetição e escrita concorrente demonstrada é local à aba. Atualizações entre abas mantêm o estado visível, mas não garantem transação atômica entre abas ou aparelhos; operações simultâneas podem competir pelo mesmo armazenamento. O acesso fictício está no estado local e não protege dados reais.

Simular falta de internet não ensaia todos os casos de queda real de rede, respostas tardias ou notificações duplicadas. Aprovação de cartão é uma indicação manual; aprovação Pix vem exclusivamente do controle fictício. Dados ou metadados modificados no próprio navegador não devem ser tratados como informação confiável de produção.

As fases Agenda, Escola, Financeiro operacional e Equipe/Infraestrutura apresentam direção e indisponibilidade, sem fabricar indicadores de módulos ainda não implementados. Reservas precedem Escola. Após validação humana, retomar os incrementos operacionais no aplicativo/API/banco existentes, preservando histórico e seguindo o ADR-004; homologar autorização, concorrência, estoque, caixa e provedor real antes de qualquer uso operacional.

## Verificação técnica

Executada no workspace local em 04/10/2026, com alterações ainda não commitadas.

| Verificação | Resultado e evidência |
|---|---|
| Testes do modelo | 30 testes passaram: consumo, estoque, alocação financeira, idempotência, Pix, caixa individual, supervisão e composição dos indicadores. |
| Testes da nova interface | 14 testes passaram: autenticação operacional isolada, venda com troco, pagamento parcial, QR, acesso inválido/revogado, caixa de outra pessoa, custos restritos, filtros/retorno, estoque, fase inválida e retomada de venda. |
| Regressão do frontend | Suíte completa: 58 testes passaram em 4 arquivos, incluindo os testes existentes. |
| Build do frontend | TypeScript e build Vite/PWA concluídos. Protótipo carregado em pacote separado do sistema operacional. |
| Build da API | Solução Release compilada com zero avisos e zero erros. Não foram introduzidos endpoints ou migrations operacionais nesta entrega. |
| Navegador | Conferidos venda com troco e duplo toque; aceitação/entrega de QR; Pix parcial, confirmação entre abas e recuperação após recarregar; reinício da demonstração; indicadores com navegação. |
| Telas pequenas | Verificação em navegador com larguras de 320 e 390 px: sem transbordamento horizontal da página; controles visíveis de atendimento com pelo menos 48 × 48 px. Não substitui teste em Android físico. |
| Isolamento | Teste de abertura com modo operacional e sem chamadas de API. Pix é fictício e nenhum QR pagável é produzido. |
| Acessibilidade | Estados textuais, controles nomeados, foco de navegação e redução de movimento implementados. Leitor de tela, ampliação de texto e ensaio com pessoas ainda precisam de validação. |

Prévias capturadas na demonstração local:

- [Atendimento em celular](prototipo-atendimento-mobile.jpg).
- [Gestão do bar](prototipo-gestao-desktop.jpg).

Resultado da rodada humana: **não coletado**. A passagem nos testes técnicos não substitui os cinco participantes nem autoriza uso operacional dos novos fluxos.
