# ADR-011 — Caixa geral de notas da Arena e destinação das compras

Status: aceito; preparado para publicação em 14/10/2026.

## Contexto

A Arena pretende obter notas emitidas para seu CNPJ por integração direta com a SEFAZ. Essas notas abrangem todas as áreas: bar, materiais de consumo, equipamentos, manutenção, outras compras/despesas e compras mistas. O certificado existe, mas ainda não foi configurado no servidor. O sistema já possui compras e recebimentos de mercadorias do bar; esses eventos não podem ser confundidos com a simples existência de uma nota.

## Decisão

Criar uma caixa de documentos recebidos com entrada inicial por XML fornecido pelo usuário, preservando bytes originais, chave, hash e autor. Validar destinatário e ambiente antes de persistir. O parser fica em Application; armazenamento e integração com compras em Infrastructure; entidade imutável em Domain, contratos e endpoints nas respectivas camadas. O PostgreSQL impõe imutabilidade e unicidade, além das regras da aplicação.

A caixa pertence ao Financeiro, fora da navegação do bar, com permissão própria `fiscal:invoices:manage`. Nenhuma nota é presumida como compra do bar: a finalidade inicial é A classificar. A classificação é mutável e auditada, separada do conteúdo fiscal imutável; uma versão de conferência impede sobrescritas e a criação de compra baseada em classificação desatualizada. Notas mistas precisam de separação dos itens antes de automatizar lançamentos.

Prévia, importação, classificação, conferência e criação da compra são ações distintas. Somente a finalidade Bar habilita a integração existente de compras do bar, exigindo adicionalmente `bar:purchases:manage`. A criação requer produtos e unidades explícitos, fornecedor consistente e confirmação do operador. Uma chave gera no máximo uma compra; repetição idêntica retorna o vínculo existente. A transação inclui fornecedor, compra, auditoria e vínculo. Estoque só muda quando o fluxo existente recebe mercadoria; pagamento fica pendente.

A primeira versão inspeciona a estrutura e os valores necessários, sem alegar autenticação fiscal do XML. Casos cujo custo por item não possa ser preservado são bloqueados para geração de compra. Captura SEFAZ, verificação criptográfica e eventos posteriores permanecem fora desta entrega e poderão alimentar a mesma caixa através de outro adaptador.

## Consequências

É possível conferir XMLs sem certificado e reutilizar essa etapa após a captura automática. O banco guarda arquivos até 2 MiB por nota, custo aceitável para o volume inicial, mas requer backup e controle de acesso. Não há descarte/edição de XML pelo produto. NF-e de equipamentos, materiais e manutenção entram na caixa geral; o encaminhamento contábil/patrimonial ou recebimento desses itens permanece nos controles correspondentes. NFS-e e composições fiscais especiais precisam de integração própria. A aplicação permanece standalone, sem dependência técnica de outros produtos.

Operação, configuração, publicação e rollback: [notas recebidas](../operacao/notas-recebidas.md).
