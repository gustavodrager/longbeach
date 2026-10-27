# Movimentos importados na Visão geral e em Recebimentos

O bloco **Movimentos importados dos bancos** fica aberto na Visão geral, após o resumo financeiro, e em Recebimentos, antes dos pagamentos registrados nas contas. Usa o histórico já importado por arquivos; não consulta as operadoras.

Selecione PagBank ou C6 e o mês desejado. Ao trocar de banco, o sistema consulta a última competência disponível daquele banco. O mês do bloco é independente dos filtros de resultados da Visão geral e dos filtros das contas em Recebimentos. Como a lista de competências do histórico reúne todos os controles, um mês pode não ter movimentos do banco escolhido; a tela informa essa ausência.

Entradas, saídas e quantidade de movimentos vêm dos totais completos da consulta. A lista do histórico é paginada; a prévia mostra somente os cinco primeiros movimentos, em ordem de data, e os arquivos pertencentes a essa prévia. O histórico completo mantém o banco e a competência selecionados nos links, com a origem individual de cada registro. A hora da consulta não é apresentada como data da importação.

Os movimentos permanecem separados dos pagamentos, contas a receber, valores em confirmação e resultados operacionais. Transferências, liquidações, taxas e pagamentos já registrados podem aparecer no extrato. A exibição não cria contas, pagamentos, baixas ou saldos. Os saldos bancários continuam acompanhados da data e da origem de sua própria fonte.

O acesso ao bloco e à consulta exige gestão. O painel do aluno não monta o componente. Não há consulta por intervalo; uma importação de extrato invalida o cache do histórico, disponibilizando os novos dados nas consultas seguintes. Erros, carregamento e ausência de movimentos têm estados próprios.

## Validação

Os testes do componente cobrem totais de 307 movimentos com página de 50 e prévia de cinco, troca de banco e competência, origem, links, ausência, erro, restrição por papel e atualização após invalidar o histórico. A integração com Recebimentos confirma que entradas de extrato superiores a R$16mil não modificam os valores recebido, a receber e em confirmação das contas. A conferência visual usa dados fictícios localmente e verifica o acesso ao detalhe da origem.

A publicação deste ajuste precisa do gate Production para o commit escolhido e de promoção somente dos arquivos web verificados. Não exige nova infraestrutura, banco, migration ou backup. A API publicada e seus registros permanecem referenciados em [release-google-vm.json](release-google-vm.json).
