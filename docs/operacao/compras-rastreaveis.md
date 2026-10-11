# Compras, totais dos comprovantes e conta pagadora

## Registro e conferência

Antes da gravação, concilie fornecedor, referência única do documento, data, quantidade, unidade de compra, total líquido e origem do pagamento com o comprovante e a confirmação do responsável. Confira a lista existente para evitar cadastrar novamente o mesmo documento.

Quando uma caixa é desmembrada em unidades ou há pesagem, o custo arredondado em centavos pode não reproduzir o total impresso. O campo opcional **Total do item no comprovante** preserva esse total, dentro da tolerância de arredondamento validada pelo domínio. Não altere a conversão permanente do produto apenas para acomodar uma compra. Descontos específicos podem compor o custo líquido do item; registre a composição na referência financeira, sem aplicar o mesmo desconto novamente no total da compra.

Confira o total registrado antes de receber. Receba somente as quantidades fisicamente entregues, no local confirmado. O recebimento converte a unidade de compra para estoque, distribui o custo exato e mantém os controles de concorrência e idempotência. A interface deve mostrar a quantidade recebida e a situação final antes de encerrar o procedimento.

## Correção da conta pagadora

A ação **Corrigir conta ou forma de pagamento** exige permissão de gestão de compras e a versão atual do registro. Atualiza somente a forma informada e a referência da conta, com auditoria. Não altera itens, custos, recebimentos ou estoque; não executa pagamento ou reembolso.

Distinga o operador do pagamento da conta de origem. Quando um proprietário opera a conta da arena, não registre crédito pessoal a compensar. Se houver um lançamento manual no Financeiro, confira sua referência separadamente: a correção da compra não modifica automaticamente esse lançamento.

O registro manual como pago não é conciliação bancária. Preserve saldo, data e fonte do último extrato confirmado; não calcule um novo saldo bancário apenas subtraindo compras avulsas. Correções de um período não autorizam alterações em outro.

## Publicação de 2026-10-06

Implementação fixada em `f20cc73d43fff7d6fe1b58318c567aac5bb3bf8f`, branch `codex/saldos-pagina-inicial`, sem migration nova.

- CI [37518542913](https://github.com/gustavodrager/longbeach/actions/runs/37518542913): 142 testes unitários, 167 de integração PostgreSQL, 179 frontend, 11 de conversores e builds API/PWA aprovados. Cobertura inclui tolerância e rejeição de totais incompatíveis, autorização, concorrência e auditoria da correção.
- API `927a665f-0dce-45e4-b695-412eeb9ef917` publicada antes da web; `SUCCESS`, readiness `Healthy`.
- Web `3e670832-aab5-4d45-b618-ff07558a6774`; `SUCCESS`, health `ok`.
- Cada patch alterou exclusivamente o SHA do serviço esperado. Snapshots registrados após cada promoção e plano Railway final sem diferenças; variáveis, bancos e serviços auxiliares preservados.
- Conferência de produção: acesso Owner restaurado pelo login Google existente, correção da conta pagadora, compras com totais exatos, recebimento em estoque, Financeiro e disponibilidade/preços no atendimento. Apenas os registros solicitados foram gravados; nenhuma venda ou pagamento foi executado como teste. Documentos, valores reais e evidências ficam fora do Git.
- O formulário com o novo total opcional foi conferido em 360, 390, 768 e 1440 px: largura da página igual à viewport, sem rolagem horizontal. A criação vazia usada nessa inspeção foi cancelada sem gravação.

Rollback de aplicação disponível para a revisão anterior `ba08ce8fc7457de13152410faa5a4852da93b1ff`: API `afe4dc01-19b4-435a-90f7-ec27b999fac2`, web `aacd2efb-f84b-497a-ae38-96f377798f83`. Preserve os dados e as auditorias existentes. A revisão anterior não oferece os novos campos/ações, mas lê os totais e referências já persistidos. Reconciliar novamente o snapshot após qualquer reversão.
