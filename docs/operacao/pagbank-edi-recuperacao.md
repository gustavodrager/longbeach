# Recuperação do histórico EDI PagBank

## Correção de 13/10/2026

O endpoint `movement/v3.00/balances` retorna `estabelecimento` como número JSON. A coleta aceitava somente texto e interrompia o dia com `EDI_SCHEMA`, mesmo com HTTP 200 e `VALIDADO=true`. Confirmado por diagnóstico que revelou apenas nomes e tipos de campos, sem valores ou credenciais, em 01/09/2026 e 12/10/2026.

O parser aceita string ou inteiro não negativo que corresponda exatamente ao estabelecimento configurado. Frações, notação exponencial, valores fora do limite inteiro e outros tipos continuam rejeitados. O payload original é preservado. Não há alteração de banco nem normalização silenciosa de identificadores.

## Execução autorizada de recuperação

Após promover a API por commit fixo, no console do serviço **api** do projeto **longbeach-os**, executar:

```sh
dotnet LongBeach.Api.dll --pagbank-edi-backfill
```

O comando usa exclusivamente as variáveis já configuradas (`Enabled`, `User`, `Token`, `StartDate`) e termina sem iniciar servidor, migrations ou outros workers. Não recebe credenciais na linha de comando. Prazo máximo: 30 minutos. Usa o mesmo lock, paginação, validação de estabelecimento, `VALIDADO`, limite de resposta, proveniência e transação por dia do coletor periódico.

A execução explícita ignora o intervalo de espera do erro corrigido, sem modificar manualmente o cursor. Reaproveita os lotes de sete dias e a sobreposição de dois dias até alcançar D-1. A gravação é idempotente por conteúdo; dias só avançam após validar os quatro relatórios. Uma falha interrompe a execução com código de saída 1, registra o código de falha e preserva os dias concluídos. Nova execução retoma com segurança.

A conclusão confirma disponibilidade e coleta dos documentos que o provedor declarou completos. Não transforma saldos em vendas, não movimenta estoque nem contabiliza recebimentos automaticamente; isso depende de classificação/conciliação. Respostas vazias devem ser confrontadas com a operação e, se necessário, com a liberação de retroativos pelo PagBank.

## Validação

- 20 testes unitários focados: inteiros/texto, tipos inválidos, divergência de estabelecimento e regras financeiras.
- 12 testes de integração com PostgreSQL 17 isolado, sem testes ignorados: recuperação de 42 dias, 168 documentos, repetição sem duplicação, consulta dos saldos, rollback por estabelecimento incorreto, paginação, timeout e reprocessamento.
- Build da API e frontend/PWA.

## Rollback

Restaurar a API ao commit anterior `4ff170e7dcc3feac06b74bc62f49e2ea3634aa0c`. Não apagar documentos já importados. A versão anterior volta a falhar diante de estabelecimentos numéricos; manter os dados para a próxima recuperação.
