# Materiais da Arena

O cadastro fica em **Administração → Materiais**. Produtos vendidos pelo Bar continuam no seu estoque próprio.

1. Cadastre nome, finalidade, unidade, local de armazenamento e mínimo. Um material novo começa em zero.
2. Abra **Movimentar**, escolha Entrada, Consumo, Perda ou Contagem física e informe a quantidade.
3. Preencha motivo/documento e área ou responsável pelo destino. Confira o saldo projetado antes de confirmar.
4. Abra a ficha para consultar os comprovantes confirmados, com operador, data, antes/depois e justificativa. O histórico anterior aparece separado.

As quantidades aceitam até três casas decimais. Zero é permitido para contagem física. Contagem igual ao saldo atual não cria ajuste. Consumo exige material classificado como consumível. Reutilizáveis e patrimônio permanecem cadastrados, sem fluxo de empréstimo ou controle patrimonial individual nesta etapa.

## Cadastros e dados anteriores

Saldos e histórico anteriores são preservados. A quantidade não é editável pelo formulário de metadados; altere-a por movimentação identificada. A contagem física dos materiais existentes é uma atividade explícita, não uma consequência da atualização.

A unidade existente fica bloqueada. Para um cadastro antigo sem unidade, só é possível completá-la explicitamente quando não há saldo nem histórico antigo/novo; nenhuma unidade é escolhida automaticamente. Cadastros incompletos com uso precisam de reconciliação. Informe o local antes de movimentar; os comprovantes guardam a localização da época, mesmo se o cadastro for editado depois.

## Conexão e concorrência

Se a confirmação não chegar, use **Conferir mesma solicitação**. A interface mantém o identificador e o conteúdo original enquanto a sessão da interface estiver ativa, inclusive após fechar/reabrir o painel ou navegar. Não troque a quantidade para tentar confirmar a mesma operação.

Se outra pessoa alterar o saldo, use **Atualizar saldo e refazer** e confira os valores antes de uma nova solicitação. Falha na atualização mantém o bloqueio; um saldo antigo não libera a gravação.

Uma recarga completa ou encerramento do navegador descarta o checkpoint em memória. Nesse caso, consulte o histórico confirmado e o saldo antes de criar outra movimentação. Trocar de conta não transfere solicitações pendentes para o novo usuário.

## Permissões e custos

- Consulta: `inventory:read`.
- Cadastro, entrada, consumo e perda: `inventory:write`; movimentos também exigem leitura.
- Contagem física: adicionalmente `inventory:adjust`, dos perfis de gestão.
- Custos e meio de pagamento continuam sujeitos às permissões financeiras.

Os movimentos não registram pagamento ou despesa automaticamente. Aquisição e pagamento continuam nos fluxos próprios.

## Referências de implantação

Modelo, imutabilidade, concorrência e retorno estão no [ADR-017](../adr/ADR-017-integridade-estoque-e-materiais.md). A migration nova é `20261027135728_MaterialStockLedger`; o histórico canônico passa a 28 migrations. O [registro da integração](integracao-estoque-materiais-2026-10-27.md) identifica a validação local e a atualização da prévia com backup. Publicação hospedada permanece uma operação separada.
