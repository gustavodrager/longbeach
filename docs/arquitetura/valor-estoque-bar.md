# Valor do estoque e potencial de venda

O início apresenta um resumo compacto abaixo dos saldos; `/bar/indicadores` oferece quatro cartões e composição por produto. São valores do estoque atual do local Bar, independentes do filtro de período. A consulta atualiza a cada 30 segundos com a tela aberta e participa da invalidação já utilizada por compras, contagens e atendimento.

## Bases comparáveis

- **Estoque a custo:** soma, por produto, da quantidade física vezes o custo médio cadastrado. Inclui reservados, ingredientes, embalagens e produtos inativos ainda em estoque. O cálculo mantém as seis casas do custo até multiplicar a quantidade e arredonda o resultado do produto em centavos.
- **Potencial de venda:** quantidade disponível (físico menos reservado) vezes o preço atual, exclusivamente para produtos ativos com estoque próprio, venda direta e preço positivo. Preparos por ficha técnica, produtos sem controle e itens sem preço são excluídos da receita, mas seu valor físico permanece no custo. Isso evita projetar simultaneamente os mesmos ingredientes em diferentes porções.
- **Lucro bruto estimado:** receita potencial menos custo somente sobre os mesmos produtos disponíveis com base de custo completa. Não deduzir o custo físico de todos os insumos da receita dos produtos prontos, nem incluir reservas já comprometidas nessa projeção.
- **Margem bruta:** lucro bruto dividido pela receita da mesma base. Não é markup, lucro realizado nem lucro líquido. Preserva resultados negativos; denominador zero fica indisponível.

Taxas, impostos, perdas futuras, descontos, mão de obra e outras despesas não compõem essa estimativa. Os cartões não criam lançamentos no Financeiro nem mudam o saldo bancário.

## Cobertura de custos

Um custo médio zero é tratado como não informado para a projeção. Não converter falta de custo em margem de 100%. O total a custo soma os valores registrados, sinalizando cobertura parcial. Se nenhum produto possui custo, a apresentação aguarda custos em vez de sugerir um estoque sem valor.

Uma entrada positiva sem custo pode diluir a média após novas compras. A consulta verifica o ciclo atual do estoque do produto em todos os locais: percorre as operações de trás para frente até o último esgotamento global. Transferências são agrupadas pelo identificador de origem para preservar delta zero. Médias afetadas continuam visíveis na composição e no custo registrado, mas ficam fora do lucro/margem e recebem aviso de conferência. Depois de esgotar completamente esse ciclo e receber um lote com custo, o lote anterior não contamina a nova projeção.

A cobertura exibida é a receita dos produtos com base de custo completa dividida pelo potencial de venda total. A composição mostra quantidade física, disponível, reservado, custo no estoque, preço, venda potencial, lucro e motivo de exclusão. Busca, filtro de custos e página ficam em parâmetros próprios na URL, com substituição do histórico ao digitar; renderização paginada e detalhes recolhidos.

## API e segurança

`GET /api/v1/bar/stock/valuation` exige `bar:finance:read`, inclusive para acesso direto. Permissão isolada de estoque ou vendas não libera custos/margens. O frontend aplica a mesma condição e descarta valores em cache se a API negar acesso.

`StockValuationRules` concentra a aritmética testável na Application; Contracts define a resposta; Infrastructure lê catálogo, saldos e movimentos numa transação `RepeatableRead` sem escrita. Exige local Bar único e não troca para outro estoque silenciosamente. Não há nova migration, configuração externa, sincronização ou alteração de custos/quantidades.

Falha de atualização mantém a última consulta com aviso explícito e data; falha inicial não apresenta zero. Estoque vazio tem orientação própria. Os detalhes distinguem zero calculado de número indisponível.
