# Venda direta por toque — comanda aberta

Implementação local em 17/11/2026, na branch `codex/venda-direta-toque-20261116`. Sem publicação, push ou integração à main nesta etapa.

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
- Backend: **736 testes unitários aprovados**.
- PostgreSQL 18 descartável: **45 testes de comanda e receitas aprovados**, incluindo receita preparada, repetição após pagamento/fechamento, preço divergente, acesso de cliente, uma unidade por toque, comprovante compacto e compatibilidade do identificador antigo.
- Compilação da API verificada pelos testes de integração; compilação TypeScript/Vite/PWA verificada separadamente.
- Prévia local com dados fictícios: 800×1280 e conferência de 390×844 sem rolagem horizontal. Testados toques sucessivos, resumo/total, recuperação da resposta perdida sem unidade extra e encerramento ao receber. Isso não substitui a conferência no tablet físico.

As imagens e o resumo dos testes ficam em `../evidencias/venda-direta-toque-2026-11-17/`, fora do repositório da aplicação. Nenhum dado de negócio foi escrito em produção.

## Publicação futura

Exige autorização própria. Publicar API compatível antes da interface e conferir a operação com o mesmo commit aprovado. Não retornar somente a API para uma versão anterior enquanto clientes com venda direta estiverem ativos. Em eventual retorno da interface, preservar e resolver as filas guardadas; não apagar armazenamento para ocultar registros incertos.
