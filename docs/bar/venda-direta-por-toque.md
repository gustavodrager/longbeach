# Venda direta por toque — comanda aberta

Implementação desenvolvida e validada localmente em 17/11/2026, na branch `codex/venda-direta-toque-20261116`. Integrada à main pelo PR #82 e publicada posteriormente, após autorização do proprietário e aprovação de Production. O [recibo da publicação](../operacao/release-venda-direta-2026-11-17.json) identifica o commit, os artefatos e as verificações.

## Comportamento

Na tela Vender de uma comanda aberta, o atendente com acesso a venda e entrega toca no produto para registrar uma unidade. O sistema aceita e entrega na mesma transação, incluindo produtos preparados e suas receitas, sem carrinho, Salvar ou confirmação de lançamento. O catálogo permanece aberto. Toques rápidos são guardados e enviados na ordem; o resumo agrupa itens equivalentes sem juntar registros do histórico. O saldo confirmado e o acesso a Receber ficam visíveis no rodapé em telas menores.

A comanda continua aberta até o pagamento. O encerramento automático após quitação e entrega, implementado no pacote anterior, permanece. O caixa do operador não é encerrado junto.

A venda avulsa e os rascunhos/operações antigos mantêm seu fluxo de recuperação. Nenhum rascunho anterior é enviado automaticamente pela atualização. As permissões existentes são preservadas; o novo fluxo não dá entrega a quem só pode vender. Pedidos feitos pelo cliente via QR continuam sujeitos às regras de aceite da equipe.

## Recuperação e concorrência

- Cada toque recebe UUID próprio e é gravado no dispositivo antes do envio. A fila é separada por operador e comanda.
- Web Locks separam a escrita da fila do envio; duas abas compartilham a fila sem perder toques ou enviar simultaneamente a mesma cabeça. Navegador sem o recurso bloqueia o lançamento direto.
- O servidor exige um produto e uma unidade por toque, entrega explícita e o preço que o atendente viu. Mudança de preço ou indisponibilidade recusa o lançamento sem mexer em consumo/estoque.
- Falha de resposta pausa a fila; **Retomar registros** repete os mesmos dados e UUID. Um lançamento incerto já tentado não pode ser removido localmente. É possível remover um registro definitivamente recusado ou ainda não enviado.
- A fila pode conter registros já aplicados pelo servidor; a tela os apresenta como aguardando confirmação, sem afirmar que estão fora do saldo.
- Enquanto houver fila ou gravação local em andamento, Receber e trocar de comanda nessa tela ficam bloqueados. Sair pelo navegador preserva a fila no destino original. Trocar de usuário interrompe os próximos envios da conta anterior.
- Novos toques ficam bloqueados sem conexão. Ao reconectar, registros previamente guardados podem continuar; falhas indeterminadas exigem Retomar. Não limpar os dados do app enquanto houver registros em conferência.
- Consultas atrasadas não substituem uma versão mais recente da comanda. Atualização em segundo plano não bloqueia novos toques quando já existe um catálogo válido; o preço é conferido novamente no servidor.

## Servidor e estoque

`AddTabItemsInput` acrescenta `DirectSale` e `ExpectedUnitPrice`, opcionais para preservar os clientes anteriores. Venda direta exige atendente e `Deliver=true`; o acesso de cliente não pode declarar entrega direta. O endpoint mantém as permissões de venda e entrega.

A operação reutiliza a transação serializável, o bloqueio da comanda e as regras de estoque/receita existentes. A receita é congelada e salva dentro da transação antes de sua entrega; qualquer falha reverte o comando inteiro. Cada toque guarda apenas um comprovante compacto em `bar_tab_operations`. Repetição lê a comanda atual e não repete entrega ou estoque, inclusive após fechamento. A chave dos carrinhos anteriores, com e sem observações, conserva seu formato original.

Não há alteração de schema ou migration. PagBank permanece fora deste pacote.

## Validação local

- Interface: **1.474 testes aprovados**, em 119 arquivos, incluindo 17 cenários específicos de venda direta e regressões de autenticação.
- Backend: **736 testes unitários aprovados**. O gate oficial também aprovou a bateria completa de **747 testes de integração**.
- PostgreSQL 18 descartável: **45 testes de comanda e receitas aprovados**, incluindo receita preparada, repetição após pagamento/fechamento, preço divergente, acesso de cliente, uma unidade por toque, comprovante compacto e compatibilidade do identificador antigo.
- Compilação da API verificada pelos testes de integração; compilação TypeScript/Vite/PWA verificada separadamente.
- Prévia local com dados fictícios: 800×1280 e conferência de 390×844 sem rolagem horizontal. Testados toques sucessivos, resumo/total, recuperação da resposta perdida sem unidade extra e encerramento ao receber. Isso não substitui a conferência no tablet físico.

As imagens e o resumo dos testes ficam em `../evidencias/venda-direta-toque-2026-11-17/`, fora do repositório da aplicação. Nenhum lançamento de produto ou pagamento real foi feito para testar produção.

## Publicação e retorno

A publicação desta release promoveu API compatível antes da interface, pelo mesmo commit aprovado. Novas publicações exigem autorização própria. Não retornar somente a API para uma versão anterior enquanto clientes com venda direta estiverem ativos. Em eventual retorno da interface, preservar e resolver as filas guardadas; não apagar armazenamento para ocultar registros incertos.

## Botão menos — publicado em 17/11/2026

Desenvolvido na branch `codex/retirar-produto-toque-20261117`, integrado à main pelo PR #84 e publicado após autorização do proprietário e aprovação de Production. O [recibo desta publicação](../operacao/release-retirada-toque-2026-11-17.json) identifica a interface nova e a API compatível preservada. Cada cartão passa a apresentar botões reais − e +, com área de toque de 44×44 px. O cartão e o + continuam adicionando diretamente; o − desfaz uma unidade já registrada, sem confirmação extra. A quantidade e o saldo são atualizados pela resposta do servidor. Em zero, o − fica desabilitado.

O proprietário definiu que a retirada devolve a unidade ao estoque. A interface usa o endpoint existente `reverse` com `returnStock=true`, um motivo fixado no registro da tentativa e UUID persistente. Preserva o histórico, a permissão de supervisão, a trava para valores pagos/Pix pendente e as transações existentes. Receitas devolvem o snapshot original de ingredientes, sem recalcular pela ficha atual. Não há mudança de API, schema ou permissões.

Somente linhas unitárias podem ser retiradas nesse atalho, como todas as criadas pelo fluxo de toque. Lotes anteriores com quantidade maior que um continuam na correção supervisionada de detalhes; o atalho não retira o lote inteiro silenciosamente.

A retirada tem armazenamento separado (`lb-direct-removals-v1`), sem mudar o formato dos lançamentos anteriores. Os dois fluxos compartilham o lock de envio. Enquanto a retirada está em gravação ou conferência, novos toques, Receber e trocar de comanda nessa tela ficam bloqueados. Uma resposta perdida preserva UUID, item, motivo e devolução; Retomar retirada repete exatamente a mesma operação. Cliques rápidos e duas abas compartilham uma única tentativa; nenhuma repetição escolhe automaticamente outro item. Tentativas recusadas e ainda não enviadas podem ser descartadas, sem apagar operações de resultado incerto. Dados inválidos do dispositivo são preservados e bloqueiam a operação.

Os testes incluem devolução única do produto e da receita após mudança da ficha, permissão, zero, resposta perdida/reabertura, cliques repetidos, duas vistas, offline, estoque e valores pagos. A prévia usa dados fictícios em 390×844 e 800×1280; não foi feita operação de negócio em produção nem teste no tablet físico. Evidências em `../evidencias/retirada-produto-toque-2026-11-17/`. Em eventual retorno da interface, preservar também a retirada pendente no dispositivo até sua conferência.

Validação final deste incremento: **1.483 testes da interface aprovados**, em 119 arquivos; **47 testes de comandas/receitas em PostgreSQL 18 aprovados**, sem skips; compilação API e TypeScript/Vite/PWA aprovada. O PostgreSQL descartável, a prévia e seus arquivos temporários foram removidos ao concluir.

A publicação do botão menos aprovou a bateria oficial completa de **749 testes de integração**, além dos 736 unitários e 1483 da interface. Promoveu somente os arquivos verificados da interface; API e demais containers permaneceram intactos, sem migrations ou escritas de teste em dados reais.

## Retirada unitária por atendente — publicada em 17/11/2026

A pedido do proprietário, o botão menos passa a funcionar também para atendentes com acesso operacional a Vender e Pedidos. Isso não concede a permissão geral de supervisão: o endpoint `remove-unit` exige `bar:sales:operate` e, em contas gerenciadas, menus e ações de venda e pedidos. `reverse`, descontos, cancelamentos e estornos gerais conservam a supervisão existente.

O servidor limita a nova ação a uma linha de exatamente uma unidade, com responsável, motivo registrado e devolução ao estoque obrigatórios. Reutiliza a transação, o lock da comanda, as travas para valores recebidos/Pix pendente, o histórico Reversed e a devolução do snapshot original dos ingredientes. Não há migrations, alteração de cadastros ou atribuição global de permissões.

A fila persiste a ação de cada retirada nova. Uma tentativa anterior sem esse campo continua no endpoint reverse original, conservando o UUID e o payload para não reinterpretar uma resposta perdida. A repetição do remove-unit usa a mesma ação, item, UUID e devolução, sem escolher outro item ou devolver estoque duas vezes.

A publicação precisa promover a API compatível antes da interface. Não retornar somente a API enquanto houver clientes ou retiradas pendentes usando remove-unit. Preservar a fila do dispositivo e os registros do servidor.

A liberação para atendentes foi integrada pelo PR #86 e publicada após autorização explícita do proprietário, pelo mesmo commit de API e interface. O [recibo da publicação](../operacao/release-menos-atendentes-2026-11-17.json) registra 736 testes unitários, 753 de integração e 1484 da interface aprovados, zero migrations e preservação do banco, Caddy, WhatsApp e configurações.

## Pendências na comanda e navegação simplificada — evolução de 17/11/2026

Pedidos deixa de aparecer nos menus do atendimento e da gestão. A navegação principal prioriza Vender, Comandas e Caixa; Receber e os demais destinos conservam suas regras de visibilidade, inclusive o acesso direto de perfis gerenciados. O contador de comandas com pendências passa a acompanhar Comandas. A grade móvel se adapta ao número de acessos visíveis.

A lista de Comandas conserva a consulta de pendências pelo estado Orders, com o rótulo Com pendências e os filtros/paginação existentes. O cartão com itens Requested ou Accepted oferece Ver pendências para os detalhes da própria comanda. Ali, uma seção destacada antes dos totais concentra os itens aguardando aceite ou entrega, com as mesmas ações e regras já existentes. Itens concluídos seguem no consumo e no histórico, sem duplicação na seção de pendências. A barra de ações deixa de ficar fixa enquanto houver pendências, para não cobrir Aceitar/Entregar no celular.

O status Accepted é apresentado como Aguardando entrega, sem introduzir uma etapa de preparo. O fluxo direto +/− permanece igual e mantém as permissões atuais de venda e entrega. O identificador interno bar.orders, seus menus e ações de acesso, a rota antiga de Pedidos e a recuperação de URLs anteriores são preservados; ocultar o menu não altera cadastros ou autorizações. A rota anterior é associada visualmente a Comandas e continua disponível para recuperação. Não há mudanças no backend, estoque, pagamentos ou schema.

Validação inclui ausência de Pedidos nos menus, contador em Comandas, acesso ao detalhe preservando filtros, aceite/entrega na própria comanda, conclusão de conta paga, leitura sem permissões de operação e regressão do +/− com atendentes. Prévia com dados fictícios em 390×844 e 800×1280; tablet físico e operações reais de negócio não usados nos testes.

Validação local deste incremento: **1.490 testes da interface aprovados**, em 119 arquivos; compilação TypeScript/Vite/PWA aprovada; navegação e resolução de pendências conferidas em prévia fictícia 390×844 e 800×1280. Os arquivos e o servidor temporário da prévia foram removidos. Nenhuma mudança de API ou de permissões foi necessária.
