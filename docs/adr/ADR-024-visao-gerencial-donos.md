# ADR-024 — Visão gerencial e acesso completo dos donos

Data: 20/11/2026. Estado: decisão autorizada; publicação depende dos gates e do recibo operacional.

## Contexto e decisão

A página inicial priorizava tarefas do dia e não reunia a base recorrente, as receitas e as metas da arena. Além disso, uma conta confirmada como dona podia herdar as limitações de um tipo Gestor compartilhado. A gestão precisa de uma visão do negócio e de acesso completo, enquanto contas de atendimento permanecem no seu escopo.

Esta decisão complementa o ADR-023: uma identidade que satisfaça todas as condições atuais de `StaffAuthorization.IsOwner` recebe o perfil Manager completo e não recebe um escopo restritivo de equipe na sessão. A configuração protegida de donos, a situação da conta, o primeiro acesso, os métodos de entrada e a compatibilidade do vínculo continuam obrigatórios. Nenhuma autoridade é derivada de nome, e-mail ou claim antiga. O tipo persistido não é alterado; os demais membros continuam limitados, e a remoção da condição de dono devolve o escopo normal na revalidação da sessão.

## Consulta e apresentação

`GET /api/v1/owner-overview` exige a política de dono, não permite cache HTTP e agrega os dados em uma transação consistente somente de leitura. A interface consulta esse contrato uma vez por competência, identidade e escopo; não recompõe a receita pela soma de fontes independentes. Contas sem essa autorização mantêm a abertura operacional existente.

A base ativa é uma fotografia na data da consulta em São Paulo. Alunos são pessoas distintas com matrícula vigente; matrículas representam vagas na grade. Mensalistas são grupos/contratos, não seus integrantes. A escolha de uma competência financeira não reconstrói uma base histórica de alunos ou contratos.

## Metas e valores

Em 23/11/2026, o responsável restringiu a meta de aulas a **segunda a sexta**: cinco turmas por dia e seis vagas por turma, totalizando **25 turmas e 150 vagas semanais**. Esta revisão substitui o cenário anterior de 35 turmas e 210 vagas. A meta de mensalistas permanece em dois grupos por dia, de segunda a domingo: **14 grupos na semana**. As 150 vagas não equivalem a 150 alunos únicos.

As turmas, matrículas e mensalidades reais de sábado e domingo continuam na base ativa e no detalhamento. Esses dias não recebem meta de aulas e não entram no numerador dos comparativos contra 25 turmas e 150 vagas. A interface apresenta suas contagens sem medidor ou divisão por uma meta zero. Esta alteração muda somente o calendário da meta; não muda preços, contratos ou cobranças.

A meta mensal em reais é estimada com as mensalidades conhecidas de cada dia com meta: cinco dias para aulas e sete para mensalistas. Na ausência de preço local, utiliza a média conhecida do mesmo segmento, preservando todas as referências da base ativa; sem referência no segmento, a estimativa é nula. Zero explicitamente combinado é preservado e valores a combinar não são convertidos em zero. A estimativa não gera cobrança ou receita. O Bar permanece sem meta monetária até existir um valor explicitamente definido.

## Fontes financeiras

- Mensalidades de aulas e de mensalistas usam a competência das cobranças emitidas. Os pagamentos vinculados liquidam essas cobranças, sem duplicar a receita; o recebido é a posição líquida conhecida até a consulta.
- Outras receitas de aulas usam os vencimentos do mês e os vínculos de aulas avulsas/experimentais ou a origem Escola identificada. Reservas e valores combinados não são somados novamente às cobranças.
- Comandas atuais usam aceitação do consumo e confirmação de recebimentos/estornos. Vendas anteriores do Bar usam seus eventos financeiros datados e aparecem em composição própria, pois não existe uma ponte de identidade para deduplicar os dois modelos.
- Valores vencidos são um subconjunto do saldo restante, com vencimento anterior à data da consulta. Controles e extratos importados não são acrescentados automaticamente aos registros vivos.

Essas bases não autorizam um total único de caixa. A interface informa período, origem, leituras desatualizadas e valores incompletos. Não é necessário alterar o schema, os contratos existentes ou os lançamentos para entregar a consulta.

## Validação e operação

Testes cobrem fontes e períodos, parcelas e estornos, preços desconhecidos e zero, metas, autorização efetiva, claims antigas, leitura sem gravação e estados da interface. A publicação utiliza artefatos imutáveis e aprovação do ambiente. A restrição de uma conta antes dona exige conferir sua identidade e os donos restantes antes da alteração específica da configuração e do tipo de acesso; publicar este código não realiza essa alteração de conta automaticamente.

O procedimento e os limites de interpretação estão em [Visão geral dos donos](../operacao/visao-geral-donos.md).
