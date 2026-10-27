# ADR-017 — Integridade do catálogo e movimentações de materiais

- Data: 27/10/2026.
- Estado: API e interface publicadas em 27/10/2026, fonte `b71dbf22127a6475b91770ba8f643df7933330b9`, schema 28, conforme o [registro da release](../operacao/release-google-vm.json).
- Origem: propostas preservadas em `arquivo/ambientes-anteriores/longbeach-perfis`, especialmente seu ADR-010. Integração autorizada após a auditoria de 27/10, na ordem Bar → materiais.

## Proteção do Bar

Uma unidade-base ou a opção de controlar estoque não pode reinterpretar um produto já utilizado. O catálogo verifica saldo/reserva, movimentos, inventários, compras, vendas, comandas e receitas, incluindo uso pendente no mesmo contexto. Nome, preço e demais metadados continuam editáveis; produto nunca utilizado pode ser corrigido.

A verificação participa da mesma serialização dos escritores de primeiro uso. Edições do catálogo, criação de compra/venda e movimentações que faltavam passam a usar transações Serializable; comandas, receitas, contagens e ajustes já usavam esse isolamento. Snapshots de produtos consultam valores atuais dentro da transação. Um contexto reutilizado recarrega o produto inalterado e recusa descartar edições pendentes. Conflitos exigem nova conferência pelo cliente, preservando os contratos de erro existentes.

Criação de produto mantém a trava e a visão ReadCommitted para a categoria padrão. Código automático, edição conjunta produto/estoque, histórico e inventários atuais foram preservados. O endpoint alternativo antigo de ajuste rápido não foi reintroduzido. Esta proteção não altera schema.

## Materiais da Arena

O cadastro e a identidade existentes em `operational_records` permanecem. Seu JSON continua como única fonte de saldo. Os comandos de entrada, consumo, perda e contagem passam por `IMaterialStock`; cada operação confirmada acrescenta um comprovante relacional imutável em `material_movements`, com antes/diferença/depois, unidade e local fotografados, motivo, destino, operador e horário do servidor.

Saldo e comprovante são gravados na mesma transação, sob a trava operacional compartilhada com o CRUD. A versão esperada impede sobrescrita concorrente. O identificador da operação é vinculado ao material, ator e conteúdo completo; repetição exata retorna o comprovante original e o cadastro atual. O serviço atualiza registros previamente carregados antes da validação, sem apagar edições pendentes.

O CRUD protege quantidade, unidade e histórico antigo; clientes anteriores não podem contornar os comandos. Um formulário com saldo desatualizado recebe conflito de versão. Repetição de metadados já confirmados continua sem criar uma versão extra. Cadastros novos começam em zero. O primeiro comprovante usa o saldo anterior existente, sem criar entrada fictícia nem declarar reconciliação física.

Unidade estabelecida permanece imutável. Um legado sem unidade só permite escolha explícita quando o saldo é zero e não há histórico JSON nem comprovantes relacionais. Essa verificação ocorre sob a mesma trava. Casos com saldo ou histórico exigem reconciliação, sem valor inferido. Localização e finalidade continuam metadados; a unidade/local de cada comprovante permanecem fotografados.

As quantidades aceitam três casas decimais e não permitem saldo negativo. Consumo exige classificação Consumable; equipamentos reutilizáveis/patrimônio não são consumidos. A classificação não implementa empréstimos, bens individuais, transferências entre locais, compras da Arena ou contas a pagar.

## Acesso e interface

Leitura exige `inventory:read`; movimentos exigem também `inventory:write`; contagem exige adicionalmente `inventory:adjust`, concedida pelos perfis de gestão. Custos e meio de pagamento seguem a proteção financeira existente. A resposta não converte custo oculto em informação disponível.

A interface preserva a solicitação completa em memória, vinculada à identidade e à sessão, durante erro incerto, fechamento do painel e navegação. Permissões/contas diferentes não herdam intenções ou respostas anteriores. Um conflito exige leitura bem-sucedida do saldo antes de outra solicitação. Após recarga completa ou encerramento do navegador, consultar saldo/histórico antes de criar uma nova operação; não há promessa de armazenamento durável desse checkpoint. Fixtures e histórico demonstrativo permanecem exclusivos do modo local de demonstração.

## Schema, transição e retorno

A migration nova `20261027135728_MaterialStockLedger` é a 28ª e foi gerada a partir do modelo atual com EF10.0.0. Acrescenta somente tabela, FK, índices, restrição de saldo e trigger que rejeita UPDATE/DELETE dos comprovantes; o DbContext também recusa essas mutações. Nenhuma das 27 migrations anteriores foi alterada. Os Designers/snapshot antigos e as migrations fiscais divergentes não foram reaproveitados.

O upgrade deve preservar exatamente os registros anteriores e deixar o ledger inicialmente vazio. A execução local inclui teste 27→28 em banco isolado, restauração de backup da prévia e comparação de contagens/hashes antes de sua atualização, conforme a autorização existente. Evidências ficam em `LongBeach/evidencias/integracao-estoque-materiais-2026-10-27/`; backups privados em `LongBeach/dados-locais/backups/`.

A implantação da API em 27/10 foi autorizada e executada por job único antes da API/interface, após backup congelado, restauração e ensaio do SQL exato em PostgreSQL 18 local isolado. Dados anteriores, sequência, 28 IDs, ledger vazio, ownership/grants e imutabilidade foram conferidos antes da retomada. O gate real foi `release-images.yml` com aprovação do environment Production; o [registro da publicação](../operacao/publicacao-estoque-materiais-2026-10-27.md) identifica os recibos. Próximas implantações continuam exigindo revisão própria de migrações, permissões e compatibilidade.

Depois de movimentos reais, não usar um Down que apague a tabela. O retorno apenas da interface mantém a nova API protegida e o schema 28. Uma falha na API exige manutenção e correção compatível, conservando os comprovantes e impedindo escritores incompatíveis até a reconciliação. Não reabrir a edição direta de saldo da aplicação antiga sobre o ledger novo.

## Verificação

Os testes dirigidos cobrem famílias de uso do Bar, metadados/produto nunca usado, contexto reutilizado e corridas de primeiro uso. Materiais têm testes de regra, HTTP/permissões/custos, replay exato e divergente, concorrência, atualização de metadados, SQL/EF imutáveis e upgrade com registros existentes. A interface cobre reenvio, conflito, recarga falha, troca de identidade, custos, leitura e legados incompletos.

Resultados de testes e limites estão no [registro da integração](../operacao/integracao-estoque-materiais-2026-10-27.md). A implantação hospedada é uma etapa posterior e separada, registrada na [release](../operacao/release-google-vm.json). Os limites do checkpoint em memória, dos legados incompletos e do retorno com escritores compatíveis permanecem.
