# ADR-008 — Contas e comandas na área do cliente

Status: implementação local; homologação com o provedor e publicação pendentes.

## Decisão

Reutilizar a cobrança unificada já existente para mensalidades, reservas e bar. A área do cliente consulta exclusivamente contas vinculadas ao usuário autenticado. O vínculo continua explícito pela gestão; nome, e-mail de contato ou participação em grupo não atribuem responsabilidade financeira automaticamente. A confirmação de uma solicitação de horário continua sem criar dívida por conta própria.

Pagamentos apresenta totais das contas vinculadas (disponível para pagar, em confirmação, já pago), filtros de situação, histórico e comprovantes. O total pago representa as contas retornadas, não um período contábil. Falha na consulta oculta valores antigos e ações, sem comunicar ausência de dívida. Indisponibilidade dos meios online impede iniciar pagamento e oferece ajuda. Falha de consulta das assinaturas é sinalizada separadamente.

A página Bar mostra itens e saldos da comanda aberta, mantendo o acesso ao cardápio existente. O link `pagamentos?conta=<id>` inclui a conta escolhida na seleção sem iniciar checkout ou pagamento; contas encerradas continuam consultáveis em Pagamentos. O identificador do link não substitui a autorização da API.

## Contrato e privacidade

`AccountDto` acrescenta `Items` opcional e `Discount`. Para contas do bar, o servidor retorna apenas identificador do item, nome, quantidade, preço unitário, total e estado. Não inclui custo, receita, atendente, motivo interno, estoque ou ações administrativas. Não há alteração de banco. Os campos opcionais preservam compatibilidade com consumidores anteriores.

Os totais vêm do serviço de comandas existente. Itens aceitos e entregues compõem o consumo; pedidos aguardando o bar, recusados e revertidos ficam identificados sem integrar o total. Descontos são exibidos separadamente. Dados indisponíveis não equivalem a uma comanda vazia.

## Pagamento

Pix e cartão continuam usando as integrações e validações existentes. Pagamento pendente não aparece como quitado, permanece acessível e mostra a validade informada pelo servidor; a expiração local não libera saldo por conta própria. A confirmação depende do provedor. A ação de consulta não abre outra cobrança. Adesão recorrente continua exigindo consentimento explícito e configuração habilitada; comprovantes são oferecidos apenas para pagamentos aprovados.

O checkout impede envios simultâneos na mesma montagem e conserva o valor da primeira tentativa nas repetições. Os identificadores existentes mantêm a idempotência no servidor. Não são armazenados cartão, CPF, código de segurança ou dados do pagador no navegador. Cobranças que chegaram ao servidor podem ser retomadas pela mesma operação já registrada. Esta etapa não modifica regras comerciais, valores, fechamento do bar ou permissões dos funcionários.

## Validação e limites

- Testes de interface: link para conta quitada sem mutação; indisponibilidade online; falha de atualização sem valores antigos; itens, desconto e estados; navegação Bar → conta; preservação de Pix em confirmação e de operação após falha.
- Integração PostgreSQL: itens sem dados internos, saldo calculado pelo servidor, pagamento parcial registrado e bloqueio de consulta/pagamento por terceiro. Regressão de idempotência, assinaturas, estornos e autorização existente.
- Prévia conectada à API e ao banco local exclusivo, com registros sintéticos identificados como demonstração; meios reais desativados.
- Antes de disponibilizar pagamentos: homologar credenciais e configuração do ambiente de testes do provedor, criação e consulta de Pix, recusa/aprovação de cartão, notificações e assinatura. A execução desta etapa não comprova homologação com o PagBank e não movimenta dinheiro.
- Envio ao repositório e publicação dependem de aprovação específica. Próximo incremento: revisão final das páginas e navegação antigas, preservando redirecionamentos e acesso às rotinas operacionais.
