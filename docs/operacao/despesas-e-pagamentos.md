# Despesas e pagamentos

Acesso: Financeiro → Despesas e pagamentos, rota `/financeiro/despesas`.

## Operação

1. Conferir as pendências de todas as datas. Os valores da lista são saldos restantes, inclusive quando houve pagamento parcial. O resumo mantém todas as pendências; os filtros afetam somente a lista.
2. Em Novo lançamento, escolher despesa/compra ou equipe. Informar somente os campos exibidos para a situação selecionada. O valor combinado com o funcionário é uma sugestão, a ser conferida para o período trabalhado.
3. Para despesa já paga pessoalmente por sócio, selecionar o sócio. A obrigação fica a reembolsar e não se registra uma segunda despesa para a devolução.
4. Abrir o lançamento e registrar o valor pago ou devolvido. O formulário sugere o saldo restante e aceita acerto parcial. Conferir o histórico e o saldo após salvar.
5. Comprovantes são opcionais na ficha: selecionar PDF, JPG ou PNG de até 2 MB e confirmar Anexar comprovante. Uma falha no anexo não desfaz o lançamento; repetir o envio usa a mesma chave de operação.

Nas Compras do Bar, Financeiro da compra reaproveita o documento de origem. Se o vínculo já existe, abre sua ficha; caso contrário, pede a situação do pagamento, preservando valor, data e unidade da compra. Não repetir manualmente um gasto já vinculado.

Se houver erro de cadastro em uma pendência sem pagamento ou adiantamento, abrir Corrigir lançamento e cancelar com motivo antes de registrar novamente. O cancelamento permanece no histórico. Cancelar o saldo de entrega da compra não comprova devolução financeira.

Uma confirmação de pagamento ou reembolso registra um acerto realizado. A transferência real, quando necessária, ocorre no meio escolhido pela gestão. Os saldos bancários permanecem baseados no extrato.

## Falhas e concorrência

- Resposta perdida: conservar o formulário e usar Tentar confirmar novamente. O sistema consulta ou conclui a mesma operação, sem gerar outra baixa.
- Saldo alterado por outra pessoa: atualizar o saldo, conferir o histórico e revisar o valor antes de confirmar.
- Erro de consulta: tentar novamente; a tela não apresenta uma leitura com falha como ausência de obrigações.
- Permissões: leitura financeira para consulta e escrita financeira para cadastro, baixas, cancelamento e anexos. Sócios cadastrados não recebem conta de acesso automaticamente.

## Implantação

Aplicar a migration `20261021154910_ExpenseAttachments` no banco correto por execução única controlada. Publicar a API antes da web. Não executar seed de pessoas, obrigações ou arquivos fictícios nos ambientes reais. Preservar o manifesto de produção até uma publicação autorizada e verificada.

Verificar em homologação: despesa avulsa, mensal e diária/turno, sócio cadastrado no fluxo, reembolso parcial, compra já vinculada, replay de operação, upload/download e usuário sem permissão de escrita. Conferir que o total em aberto acompanha as baixas e que o valor dos sócios já está incluído nesse total.

Direção e invariantes: [ADR-013](../adr/ADR-013-despesas-pagamentos-e-reembolsos.md).

## Validação local — 21/10/2026

- Frontend: 465 testes aprovados e build de produção concluído. Após o ajuste final do atalho da Visão geral, 17 testes de navegação/métrica e novo build também aprovados.
- Backend: 439 testes unitários aprovados, sem falhas ou testes ignorados, e build Release da API concluído sem avisos ou erros.
- PostgreSQL 18 descartável: suíte completa de integração com 356 testes aprovados, sem falhas ou testes ignorados. PostgreSQL 17 descartável: 14 integrações de despesas, comprovantes e posição financeira aprovadas, sem testes ignorados.
- Navegador com API e banco reais, usando somente dados fictícios: cadastro de despesa, equipe mensal e por turno, sócio no próprio fluxo, pagamento e reembolso parciais, persistência após recarregar e envio de comprovante. O saldo resultante de R$ 2.480,00 contém R$ 400,00 devidos ao sócio; a Visão geral mostra as duas baixas de R$ 200,00 e R$ 500,00 como R$ 700,00 pagos no período.
- Layout conferido em desktop e larguras de 390 e 320 pixels, sem rolagem horizontal da página ou do formulário. Teclado de aparelho móvel físico não foi testado.
- Migration aplicada somente no banco local descartável. Nenhum ambiente hospedado foi alterado ou publicado nesta implementação.
