# ADR-006 — Cobranças do Bar, da Quadra e dos alunos

Data: 2026-10-06. Estado: implementação protegida por configuração; ativação depende de homologação.

## Decisão

O Long Beach mantém autenticação, banco, credenciais e implantação próprios. Um serviço de cobranças vincula explicitamente uma conta existente a um usuário responsável e, quando aplicável, ao aluno da matrícula. A associação é feita pela gestão; nomes e documentos fornecidos no checkout não concedem acesso. Um usuário pode ser responsável por mais de um aluno, mas cada aluno e grupo têm um único responsável vinculado neste fluxo. Troca de responsável exige tratamento administrativo auditado, fora do checkout.

O portal consulta a identidade da sessão em `/api/v1/me/billing`. `finance:read` abre a gestão; `finance:write` permite vincular, receber, estornar e conciliar. O portal não expõe permissões de gestão nem custos do Bar.

Cada cobrança corresponde a uma comanda ou lançamento financeiro. Na Quadra, a origem é reserva, matrícula/competência ou mensalidade do grupo/competência. A assinatura do grupo usa o identificador do grupo, não o de um mês. O responsável paga o total da locação. Cada conta é paga separadamente.

O Bar continua usando `IBarTabs`, seu saldo, suas reservas de valor, seus estornos parciais e seu histórico. Caixa e portal disputam o mesmo saldo sob os bloqueios existentes. A Quadra usa `billing_payments`, `billing_refunds`, `billing_subscriptions`, `billing_orders` e `billing_settlements`, sem duplicar `financeEntries`. Valores e vencimentos vêm do servidor. Pagamentos e estornos não alteram estoque, presença ou agenda.

## Confirmação e recuperação

A intenção é gravada antes da chamada externa. Timeout mantém o saldo reservado e a mesma chave de operação. Referência, valor, moeda e identificadores são conferidos antes da baixa. Eventos repetidos não repetem a baixa; um estado antigo não desfaz aprovação ou estorno. Uma confirmação tardia de pagamento já cancelado exige conciliação, pois o saldo pode ter sido reutilizado.

Pedidos/faturas do provedor ficam em registros imutáveis separados do recebimento. Não persistir corpo bruto do cartão nem payloads de pagador. O SDK oficial criptografa no navegador. Na recorrência, o contrato específico também solicita o código de segurança no pedido de adesão: ele transita somente em memória e HTTPS, não entra em entidades, auditoria ou logs. Nenhum PAN é enviado ao servidor Long Beach. Observabilidade, proxy e APM não devem capturar bodies desses endpoints.

O webhook de Pedidos valida ECDSA sobre bytes originais e consulta o pedido autenticado. A atualização de chaves usa cache por conta/ambiente; a chave anterior permanece por sete dias. A consulta de chaves é independente da permissão de iniciar novos pagamentos. A rotação remota do par de chaves não é automatizada.

A notificação de assinaturas é somente um sinal para consultar a API autenticada. Não é prova de pagamento. Nenhum estado, valor ou URL recebido no callback produz baixa diretamente. Faturas e pagamentos são conferidos também pelo trabalhador de recuperação.

## Recorrência

A adesão registra consentimento, valor e primeiro vencimento. O plano é mensal, sem reajuste ou pro rata. O período inicial usa trial até a data aceita; esta combinação deve ser homologada com o PagBank, inclusive nos dias 29–31. A competência é calculada a partir da primeira data e do número da ocorrência, nunca da data em que o webhook chegou.

Competências quitadas ou em processamento impedem adesão. Assinatura ativa impede pagamento avulso da mesma origem. Após cancelamento, parcelas pendentes só são liberadas quando o histórico completo do provedor comprova ausência de tentativa em andamento. Cancelar não estorna, não encerra matrícula e não cancela aulas ou reservas.

Grupos com assinatura precisam ter valor fixo e quinto encontro incluído. A geração de competências reutiliza o serviço mensal idempotente existente, que preserva reservas já geradas e cria uma cobrança por mês. Conflitos de agenda, valores divergentes e acordos variáveis exigem intervenção, sem baixa automática. Não há cancelamento de agenda por inadimplência.

## EDI

O coletor permanece independente. A gestão associa uma liquidação validada a um pagamento integrado, conferindo a referência no extrato e justificando o vínculo. Nesta entrega, a associação cobre liquidação simples, sem antecipação, com até uma parcela e sem estorno. Bruto deve ser igual a taxas mais líquido e ao valor do pagamento. Um evento e um pagamento só podem ser associados uma vez. A associação não gera receita adicional nem altera os relatórios antigos de taxas do Bar.

## Entrega e reversibilidade

Duas migrations aditivas criam a base e os documentos do provedor; o constraint do Bar passa a aceitar `CreditCard`, preservando históricos. Não executar downgrade em banco com operações reais. Desligar criação mantém consulta, confirmação, estorno e recuperação dos registros existentes. A ativação segue o runbook e a aprovação do environment de produção.
