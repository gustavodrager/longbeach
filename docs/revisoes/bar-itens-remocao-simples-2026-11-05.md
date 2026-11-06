# Remoção simples de itens no Bar

Pedidos e comandas oferecem **Excluir item → Confirmar exclusão**, sem campo de motivo. A confirmação identifica o item, a quantidade, a comanda e o valor. O histórico recebe a descrição neutra `Item removido pela equipe.`, mantendo o registro de quem executou a operação.

Pedidos aguardando aceite usam a recusa já existente. Itens aceitos ou entregues usam a correção de consumo existente, somente quando a pessoa tem supervisão e a API autoriza a ação. As restrições de recebimentos e pagamentos pendentes permanecem no servidor. A remoção não solicita retorno físico ao estoque; as reservas de itens não entregues seguem as regras atuais.

Pedidos mantém trava por item e repetição com a mesma identificação de operação. Comandas guarda a remoção pendente por usuário e comanda antes do envio, para poder consultar ou repetir o mesmo registro após falha de conexão ou recarga. Uma pendência bloqueia alterações concorrentes no próprio fluxo. Perda de acesso apresenta orientação e impede confirmação, preservando a pendência. Aceitar e entregar conservam o corpo legado e suas identificações de repetição.

Cancelar a comanda inteira, descontos e outras autorizações conservam seus motivos e permissões. Não há alteração funcional da API, migration ou mudança de perfis.

Validação local: **172 testes afetados**, **1.388 testes completos da interface em 113 arquivos** e **build TypeScript/Vite/PWA** aprovados. Os cenários cobrem pedidos novos, itens aceitos e entregues, manutenção do item, permissões, resposta perdida, recarga, armazenamento indisponível, troca de conta e restrições financeiras. Os testes usam dados fictícios e não registram operações em produção.

Revisão de boas práticas de React realizada: hooks sem condições, seleção vinculada ao usuário e à comanda, foco em **Manter item** e retorno ao botão de origem, sem dependências ou consultas adicionais.

Comprovantes privados em `evidencias/bar-itens-remocao-simples-2026-11-05/`. Esta mudança segue em revisão própria, separada da versão `3154420` autorizada para publicação na revisão #70.
