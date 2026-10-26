# C6 e PagBank por arquivos

Decisão do proprietário em 25/10/2026: enquanto as APIs C6, PagBank e PagVendas estiverem indisponíveis, atualizar extratos, movimentos e saldos dos dois bancos por importação. Não manter a regra de consulta financeira a cada 30 segundos. Retirar também o botão global Atualizar dados e seu orquestrador; atualizações internas após salvar ou aplicar um arquivo permanecem.

## Operação

Em Financeiro, usar Importar extratos. Selecionar C6 ou PagBank e um arquivo OFX ou CSV, conferir banco, entradas, saídas e saldos da prévia e selecionar Conferir importação. O servidor identifica registros novos e já importados. Aplicar extrato conferido disponibiliza os dados no histórico e os saldos datados no painel.

OFX aceita uma conta BRL por arquivo, identifica a conta pelo ACCTID e cada movimento pelo FITID. Preserva a data bancária informada. Transações ou saldo incompletos, múltiplas contas e múltiplas posições de saldo são recusados, sem importação parcial silenciosa.

CSV aceita separador ponto e vírgula, vírgula ou tabulação e células entre aspas. Cabeçalho recomendado: `Data;Descrição;Valor;ID;Saldo`. Data usa DD/MM/AAAA ou AAAA-MM-DD. Valores usam centavos explícitos, como `1234,56` ou `1234.56`; entradas são positivas e saídas negativas. ID é o identificador bancário da transação. Para deduplicar entre formatos, informar o mesmo número de conta presente no ACCTID do OFX, incluindo zeros. Saldo é opcional, com uma única posição por data; para importar somente saldos, usar Data e Saldo. Arquivos têm limite de 5 MB e 2.000 registros entre movimentos e posições de saldo.

O CSV exige os campos reconhecidos; não presume a interpretação de um layout desconhecido, de um valor ambíguo, de uma data inválida ou de um movimento sem ID. Exportações sem esses campos precisam ser normalizadas ou substituídas por OFX antes de aplicar. Dados de exemplo na documentação e nos testes são fictícios.

## Identidade, saldos e preservação

O conteúdo original tem SHA-256, lote de staging e confirmação por fingerprint. A identidade bank-v1 inclui banco, hash da conta, tipo e hash do identificador. Uma transação idêntica em outro arquivo é reconhecida sem somar novamente. Novos IDs no mesmo dia podem ser acrescentados. Reinterpretação de um ID existente ou de um saldo da mesma conta/data é recusada; registros anteriores não são sobrescritos. Arquivos antigos agregados sobrepostos continuam protegidos contra dupla contagem. O apply conserva lock transacional e auditoria.

Movimentos ficam nas séries pagbank-conta e c6-conta. Snapshots usam saldos/Saldo Pagbank e saldos/Saldo C6. Os cartões mostram a data do arquivo e sua origem; C6 também distingue o instante da importação. Saldos não são somados entre si, estimados por movimentos ou apresentados como dinheiro disponível agora. Ausência ou ambiguidade mantém o valor indisponível. Carteira EDI e documentos anteriores das APIs continuam no histórico separado.

Importar extrato não cria venda, baixa conta, quita Pix pendente ou atribui unidade comercial sem evidência. Os controles internos do Bar e da Quadra, pagamentos, estornos pendentes e históricos são preservados.

## Pausa das APIs

`Integrations__Banking__ImportOnly=true` bloqueia os transportes C6/PagBank, EDI, pagamentos e recorrência antes de HTTP e faz os workers de provedor retornarem. A configuração de cobrança informa ImportOnly e os meios online ficam indisponíveis. A interface retira cobrança, retomada, consulta remota, assinatura e estorno remoto; comprovantes, histórico e estornos manuais internos seguem suas permissões.

As flags específicas C6, EDI e pagamentos também devem ficar false em produção como proteção adicional. Não retirar credenciais ou apagar os dados existentes. A retomada das APIs exige decisão explícita, validação do acesso, revisão dos pagamentos/estornos que permaneceram pendentes e alteração controlada das flags. Não transformar indisponibilidade em pagamento ou cancelamento confirmado.

A implantação reutiliza o Cloud Run e o Firebase Hosting existentes. Não há migration, nova tabela, banco ou ambiente de homologação para esta alteração. Testes usam somente PostgreSQL local e dados fictícios.
