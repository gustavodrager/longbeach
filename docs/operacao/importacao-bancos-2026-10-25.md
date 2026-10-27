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

## Validação da versão

Código da API e da interface: `932f1f6b1a905b29e43dd571ab553c598f49a533`. Passaram 554 testes de interface, 472 testes unitários do backend e 21 testes com PostgreSQL local. Os testes de banco cobrem preservação de operações pendentes, seleção de saldo C6 e deduplicação entre arquivos. TypeScript e builds Release passaram. A imagem OCI linux/amd64 foi conferida sem rede, banco ou portas públicas, com autenticação fictícia; nove verificações HTTP incluíram a configuração ImportOnly e os meios online desativados. A prévia de importação foi conferida visualmente em computador e celular com dados fictícios.

## Publicação verificada

Publicado em 25/10/2026 às 21h17 em São Paulo (26/10 às 00h17 UTC), no projeto Google existente `parsero-prod-20261022`.

| Referência | Valor verificado |
| --- | --- |
| API Cloud Run | `longbeach-api-00006-b4k`, Ready, 100% do tráfego |
| Índice OCI | `sha256:b8e6fdc254cc1226ea25881e046a6e627a8eefa2b4c354bc98059aa6a79ab548` |
| Filho Linux/AMD64 | `sha256:ce3fb6eb6f5a9449a2f4282561e386aaeaf328a3e51dcd177635476d03a0a47d` |
| Firebase Hosting | versão `69f089d0105cddbd`, release `1792973839016000` |
| Artefato web | `441fbba65967294fcf42bd329b222f52113c87ac7281a6a6c910b0dc4bc0a1c7` |
| Arquivos públicos conferidos | 73, hashes e cabeçalhos compatíveis com o build |

O plano completo conservou 57 recursos e propôs somente dois updates existentes: imagem e dez flags de modo bancário na API e na definição do job de migration. O job não foi executado. A revisão independente confirmou configurações SQL, referências a segredos, IAM, DNS, rede, CORS, limites e controles automáticos de migration/seed preservados. O drift SQL aceito limitou-se ao campo computado `settings.version` de 14 para 15, comprovado pelo schema local do provider Google 8.6.0; o recurso SQL ficou no-op.

O pós-publicação confirmou saúde, autenticação obrigatória, CORS, revisão, digest, 100% do tráfego e ImportOnly, com releitura final do serviço. A interface autenticada mostrou o formulário OFX/CSV, os saldos com data/origem e a ausência de Atualizar dados no topo. Não houve importação real, pagamento, estorno, migration, novo banco ou ambiente hospedado nesta conferência. Os saldos exibidos continuam sendo as últimas referências já importadas; não foram atualizados por este deploy.

As variáveis locais definitivas passaram a refletir o novo digest e as flags conferidas (SHA256 `722f6398305081231fdba2386e46941b92458b79797e42a1f4fa28f64f1cca34`). Assim uma próxima publicação não reativa o EDI pela configuração anterior. A homologação suspensa permanece sem alteração; esta release não cria custo de infraestrutura adicional.

Para recuperação, manter ImportOnly e as flags dos provedores desativadas. Não retornar automaticamente à configuração anterior com EDI habilitado. Reverter a web somente se necessário, após avaliar compatibilidade, preservando dados e pagamentos pendentes. A retomada das APIs exige nova validação e decisão explícita do proprietário. Recibos completos e capturas com dados do sistema ficam nos artefatos locais privados, fora do GitHub.
