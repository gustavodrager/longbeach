# Backlog incremental Bar V1

Não confundir etapas entregues do PDV v0.1 com aceite do escopo V1. Dependências e gates abaixo prevalecem sobre a sequência histórica. Cada item é um commit revisável com teste da regra/fluxo afetado; não incluir alterações locais de terceiros.

| Etapa | Incremento / reaproveitamento | Aceite e dependências |
|---|---|---|
| Bar 0 Fundação | Reconciliar checkout/commits existentes; baseline PostgreSQL; ADR; contratos de conta/origem/identidade; políticas por objeto | Build API/app, testes existentes, upgrade de migrations, auditoria e acesso negado; sem deploy |
| Bar 1 Operação | Conta visitante + lançamentos de atendentes, snapshot/origem, saldo e pagamentos parciais/mistos; adaptar PDV atual | Primeiro fluxo visitante→consumo→recebimento→fechamento; não duplicar estoque/caixa; gate de concorrência |
| Bar 2 Estoque | Reutilizar ledger/locais/inventário/perdas; vincular baixa ao consumo; ficha técnica/ingredientes | Baixa única, reversão física explícita, receita versionada e custo histórico; sem importar saldo JSON |
| Bar 3 Caixa | Reutilizar abertura/reforço/sangria/fechamento/divergência e adaptar dinheiro alocado | Duas formas de pagamento não duplicam caixa; Pix fora de caixa físico; estorno com sessão correta |
| Bar 4 Compras | Reutilizar fornecedor/compra/recebimento; completar UI multiitem/parcial e custo médio | Recebimento idempotente e unidades reconciliadas; documentos dependem de Files |
| Bar 5 Cliente/autoatendimento | Mesmo app/PWA, acesso QR seguro, barcode, minha conta/consumo/pagamento móvel | Isolamento por conta, revogação/expiração, concorrência com atendente; provider homologado antes da cobrança real |
| Bar 6 Gestão | Dashboard por consumo/pagamento, CMV/receitas, papéis/limites, consumidor financeiro | Valores conciliáveis, sem dupla contabilização; Files/Financeiro oficiais quando necessários |
| Bar 7 Automação | Recuperação/conciliação automática; futuras integrações NFC/RFID/sensores/visão | Observabilidade e revisão humana; V1 funciona sem esses recursos |

## Primeira fatia segura recomendada após resolver gates
Abrir e consultar conta visitante pelo atendente, na API e app existentes, sem lançamento financeiro ou estoque. Criar BarAccount e migration aditiva, DTOs, serviço/policies no padrão existente, tela mínima no shell; registrar ator e auditoria. Testar visitante sem cadastro, falta de permissão, acesso por objeto, repetição idempotente e PostgreSQL/upgrade. Não exigir CashSession na abertura. Não reaproveitar Role Student como cliente indiscriminadamente. Próximo incremento adiciona consumo e só depois conecta recebimentos.

## Por que não iniciar implementação nesta revisão
O checkout já contém implementação além da primeira fatia, com mudanças locais extensas, e exige auditoria/reconciliação de baseline. O fluxo PostgreSQL precisa passar e o contrato financeiro precisa deixar de assumir pagamento único antes de integração operacional. Documentação fecha a direção; não significa que testes ou homologação estejam aprovados. Ver validacao-v1.md para resultados observados.
