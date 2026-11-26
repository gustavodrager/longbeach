# Recuperação da venda direta — 25/11/2026

## Estado e objetivo

Implementação preparada na branch `codex/recuperacao-vendas-comandas-20261125`, partindo de `c4583705e358523be917ba17a9f82c57275bf263`. Este documento não é um recibo de publicação. Não foram alterados dados de produção, schema, migrations ou infraestrutura.

O incidente informado mostrava um produto aguardando confirmação, saldo confirmado zerado e a mensagem genérica de conflito. A mensagem correspondia ao tratamento de `DbUpdateException`, mas não permite identificar a constraint ou concluir que houve duplicidade. Sem os logs da requisição original, a causa específica continua não comprovada.

O objetivo é recuperar conflitos transitórios e isolar uma falha persistente no produto afetado, permitindo continuar o atendimento sem perder registros ou apresentar um saldo incerto como quitado.

## Comportamento operacional

| Situação | Comportamento |
| --- | --- |
| Conflito transitório conhecido na gravação | API repete a transação até três vezes, preservando UUID e fingerprint. |
| Resposta perdida, timeout ou falha recuperável | Interface tenta até três envios por ciclo, preservando UUID, produto, unidade e preço. |
| Falha persistente de um produto | Produto permanece em conferência; outros produtos e outras comandas continuam disponíveis. |
| Novo toque do produto em conferência | Bloqueado para evitar recriar a mesma intenção como nova venda. |
| Fila de outro operador no dispositivo | Consultada somente para proteção. Deve ser retomada pela conta original. |
| Retirada em conferência | Preserva item, ação, UUID, motivo e devolução; continua exigindo retomada explícita. |
| Pagamento, fechamento ou cancelamento com fila local | Ação protegida na tela e no handler, inclusive em acesso por URL direta. |
| Pagamento já iniciado | Consulta e recuperação continuam disponíveis, com a chave e os dados originais. |
| Falta de conexão, permissão, armazenamento ou Web Locks | A causa é mostrada; os registros existentes são preservados. |

O rodapé mantém o saldo confirmado, e o resumo apresenta **Saldo em conferência / Conferir itens** enquanto há pendências. Valores pendentes não são somados cegamente ao total: uma resposta perdida pode corresponder a um item já gravado no servidor.

## Limites de repetição e espera

- **API:** três tentativas transacionais apenas na venda direta, para `40001`, `40P01` e `DbUpdateConcurrencyException`. Pequeno atraso com variação entre tentativas. A transação anterior é descartada e o tracker limpo antes de repetir.
- **Interface:** três envios HTTP por ciclo, com intervalos de 1,5 e 4,5 segundos e timeout de 15 segundos por envio. O orçamento de tentativas é persistido antes do envio; recarregar, reconectar ou sair da tela não o reinicia.
- **Retomar registros:** ação explícita que reinicia o ciclo usando os mesmos UUIDs e payloads. Não gera uma venda substituta.
- **Financeiro:** timeout de 30 segundos nas ações protegidas, incluindo a espera pelos locks; nenhum retry automático de pagamento, fechamento ou cancelamento. Checkpoints de resultado indeterminado são preservados. Uma espera expirada é removida da fila de locks e não pode executar um POST tardio.
- Os limites são de camadas diferentes: até três requisições da interface podem conter até três tentativas transacionais cada. Todas continuam representando a mesma operação idempotente.
- Constraints como `23505`, `23503` e `23514` não são classificadas genericamente como transitórias. Um erro estruturado com `retryable=false` interrompe o ciclo automático daquele item.

## Contrato e diagnóstico

Falhas de gravação capturadas na venda direta retornam HTTP 409 com os campos adicionais:

```json
{
  "code": "direct_sale_retryable_conflict",
  "retryable": true,
  "outcome": "unconfirmed",
  "operationId": "<UUID original>",
  "traceId": "<referência da requisição>"
}
```

O outro código é `direct_sale_write_failed`, com `retryable=false`. `outcome` permanece `unconfirmed` nos dois casos. O cabeçalho `Retry-After: 1` acompanha a resposta recuperável.

Os logs estruturados registram `TraceIdentifier`, `OperationId`, `TabId`, tentativa, código, `SqlState`, `ConstraintName` e tipo da exceção. Não acrescentam payload, valores SQL nem o texto/details da exceção. A referência de suporte aparece ao lado do item na interface quando enviada pela API.

Para investigar uma pendência persistente:

1. Preserve o armazenamento do dispositivo e identifique a conta que originou a fila.
2. Correlacione `traceId` e `operationId` com os logs da API. O número exibido da comanda não substitui o GUID interno.
3. Consulte o recibo idempotente e o histórico da comanda em modo somente leitura. Verifique consumo, entrega e estoque antes de qualquer correção.
4. Resolva a causa indicada pelo SQL state/constraint. Não invente uma nova chave, não altere o preço do registro incerto e não exclua a fila para ocultar o aviso.
5. Retome a confirmação original e confira que há uma única unidade, uma única movimentação de estoque e o histórico esperado.

Uma recusa posterior de uma tentativa que já teve resultado incerto não transforma o registro em descartável. Somente uma recusa definitiva sem tentativa anterior incerta, ou um toque ainda não enviado, permite a remoção explícita local.

## Compatibilidade e concorrência

As chaves `lb-direct-sales-v1` e `lb-direct-removals-v1` são preservadas por operador e comanda. Metadados de recuperação são opcionais, e filas antigas pausadas são lidas conservadoramente. O envelope continua indicando `paused` para clientes antigos interromperem ao encontrar itens em conferência. Não limpar armazenamento durante atualização ou rollback.

O lock de envio é compartilhado por todas as contas da mesma comanda no dispositivo. Toques usam admissão compartilhada com `ifAvailable`; operações financeiras usam a ordem **envio → admissão exclusiva** e conferem a fila novamente dentro do lock. Um toque durante a confirmação financeira não fica guardado para executar depois de uma eventual conclusão da comanda.

Entrega, rejeição e retirada/exclusão de item também passam pela proteção local, porque podem provocar encerramento automático. A decisão depende da ação, não do saldo em cache, que pode estar desatualizado após um pagamento concorrente. O aceite continua disponível.

Abortos encerram a espera da requisição, inclusive durante refresh compartilhado de autenticação. Não cancelam o refresh de outras requisições e não disparam um POST tardio após o timeout. Cancelar a espera não prova que o servidor deixou de gravar: por isso o UUID permanece na fila.

## Limites conhecidos

A fila é local. A proteção considera operadores e abas deste dispositivo/origem; não coordena intenções ainda não enviadas de outros dispositivos. Confirmações externas por webhook/worker também podem concluir pagamentos. Não há promessa de disponibilidade absoluta nem alteração da arquitetura para fila distribuída neste pacote.

Navegação continua disponível com pendências, mas recuperar envios exige reabrir a comanda na conta original. Não foi introduzido um worker global de envio em segundo plano.

API antiga continua compatível com a interface nova, mas não oferece a nova classificação de falha nem a recuperação transacional. Durante uma atualização, evitar manter abas antigas e novas operando simultaneamente: clientes antigos usam o lock de envio anterior. Concluir ou preservar as pendências, atualizar as abas e conferir as filas antes de retomar a operação.

## Validação

- API e projeto de integração compilados com o SDK indicado em `backend/global.json`.
- **45 testes da classe `BarTabsPostgresTests` aprovados em PostgreSQL 18.7**, incluindo falha após SQL antes do commit, rollback completo, replay sem duplicação, limite de tentativas, constraints, cancelamento, estoque e ausência de retry em pagamentos/carrinho legado.
- **2 testes do contrato HTTP e privacidade dos logs aprovados** em `DirectSaleWriteProblemTests`.
- Testes focados da interface cobrem venda/retirada, resposta perdida, timeout, orçamento persistente, fila antiga, autenticação, outras contas, locks e proteção financeira. Regressões de recebimento, cancelamento, pedidos e exclusão também foram executadas.
- A revisão adicional cobre interrupção durante a terceira tentativa sem quarto envio automático, troca de operador durante uma tentativa incerta, saldo desatualizado e expiração enquanto aguarda um lock sem execução posterior.
- Build TypeScript/Vite/PWA aprovado. A bateria oficial completa deve corresponder ao commit final da PR.

Os testes de banco usaram um cluster temporário exclusivo, encerrado e removido ao concluir. Nenhuma operação real de negócio foi feita para validar a mudança.

## Promoção e retorno

1. Conferir o commit final e o CI completo da PR.
2. Gerar os artefatos identificados pelo commit/digest e obter a aprovação de `Production` exigida por `AGENTS.md`.
3. Promover a API compatível antes da interface. Não executar migrations: este pacote não possui alteração de schema.
4. Confirmar saúde da API e versão publicada da PWA; atualizar o tablet preservando os registros locais.
5. Conferir a pendência original com a mesma chave e monitorar os campos estruturados de recuperação. Não fazer vendas ou pagamentos fictícios no banco real.

Em rollback, retornar os artefatos identificados da release anterior e preservar filas, recibos e histórico. A interface anterior pode voltar a pausar a fila inteira; isso não autoriza apagar registros incertos. Registrar commit, digests, aprovação e verificações em um recibo próprio quando a publicação ocorrer.
