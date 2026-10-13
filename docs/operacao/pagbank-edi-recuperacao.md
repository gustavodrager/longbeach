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

## Publicação

- PR: https://github.com/gustavodrager/longbeach/pull/28
- API: commit `544318f89f45f0aac9ad2fae6609417b2e49a976`.
- Railway: deployment `754a5d60-9abc-46e3-9f1b-c9dedc1caca3`, saudável em 13/10/2026 às 16:14 UTC.
- Imagem: `sha256:124c3c281add1e3350c1d67b2f709cb784f8bdb1b7dd2c094b3f22782b7ab44e`.
- Apenas a origem da API foi promovida; configuração EDI e início em `2026-09-01` preservados. API e web responderam aos healthchecks.

## Resultado da importação

Concluída em **13/10/2026 às 16:16:37 UTC**. Conferência direta, somente de leitura, do banco de produção:

- Cursor: **2026-10-12**, `failure_code=NULL`, `failure_count=0`.
- Período: **2026-09-01 a 2026-10-12**, 42 datas e 168 documentos validados (quatro relatórios por dia).
- `transactional`: 229 registros; `financial`: 229; `cashouts`: 229; `balances`: 84.
- Todos os relatórios cobrem 42 datas. Vendas/financeiro/saídas têm primeiro dia não vazio em 02/09; saldos começam em 01/09. As contagens dos relatórios não devem ser somadas como novas vendas.
- CI da PR aprovado no PostgreSQL 17, PostgreSQL 18 e frontend/PWA.

O coletor periódico segue habilitado para D-1. A conferência contou documentos e datas, sem expor tokens, identificadores pessoais ou valores monetários.

## Visão geral: carteira EDI e conta digital — 13/10/2026

O manual oficial EDI 3.01.00, páginas 25–26, 28 e 36, identifica evento 07 como saldo inicial e 08 como saldo final. A carteira de liquidação da adquirência é explicitamente distinta da conta corrente digital. Fonte: https://developer.pagbank.com.br/docs/edi (manual vinculado: https://drive.google.com/file/d/1Hs5YwxM2Jy3MD2U_QsBqOaCnWzFa_5jC/view).

O painel preserva `pagBank` como último extrato bancário importado, identificado como histórico, e acrescenta `pagBankWallet` como saldo final da carteira de vendas em D+1. Não substitui a conta bancária pelo EDI, não soma inicial/final nem datas diferentes, e não altera o resultado mensal.

A consulta usa a última data completa até ontem e a última coleta validada dessa data. Confere estabelecimento configurado, todas as páginas, contagem, data dos registros, evento 08 único e precisão em centavos. Ausência, duplicidade ou falha de contrato produz indisponibilidade explícita, nunca zero presumido nem fallback silencioso para uma coleta antiga. O link abre os documentos na data exata; hashes e horário da coleta são preservados na resposta.

O painel de conexões distingue coleta EDI, arquivos PagVendas, Pix, cartão e assinaturas. Não expõe credenciais e não habilita cobranças. Produção segue sem credenciais de Pedidos/Recorrência; catálogo, vendas detalhadas e estoque PagVendas dependem de arquivos conferidos ou contrato oficial de integração. Não há sincronização de comandas externas nem baixa de estoque a partir de totais EDI.


### Conferência da visão geral publicada

Em 13/10/2026, conferência autenticada confirmou carteira EDI com saldo final **R$ 0,00 em 12/10/2026**, coleta às 13:56:21 de Brasília. O saldo **R$ 2.365,66 de 30/09/2026** permanece identificado como histórico da conta digital. O resultado mensal de setembro permanece **-R$ 1.154,07**, receitas R$ 11.147,87 menos despesas R$ 12.301,94; não foi substituído pela carteira EDI. O link da carteira abriu os documentos originais com filtro `ediDate=2026-10-12`, exibindo 29 movimentos dos quatro relatórios separados.

Publicação, versões, testes e rollback estão registrados em `docs/bar/comandas-operacao-e-migracao.md`, seção de 13/10/2026. O painel distingue recursos ativos das pendências: Pix, cartão e recorrência exigem credenciais/homologação; sincronização direta de catálogo, estoque, vendas detalhadas e comandas PagVendas exige contrato/API oficial disponível. Os fluxos atuais por arquivo permanecem sujeitos à conferência. Não está implantada atualização automática do saldo da conta corrente digital.


## Liberação e teste local — 13/10/2026, 14h24 BRT

O proprietário autorizou diagnóstico da credencial de produção e reafirmou que a homologação deve permanecer local. A autorização provisória para criar staging no Railway foi revogada antes de qualquer alteração remota; nenhum serviço de teste foi provisionado.

Consultas somente GET: no Sandbox, `/public-keys/card` e `/public-keys/webhook` retornaram 200, com chave ECDSA válida. Em produção, cartão retornou 200; webhook tipado retornou 404 e o formato query documentado retornou 403. A credencial de produção autentica, mas isso não comprova homologação nem permissão para todas as APIs. Foi utilizado o token existente reenviado pelo portal ao endereço cadastrado. Nenhum token foi gerado, rotacionado ou registrado no Git. A cópia temporária da credencial de produção foi removida após o diagnóstico.

Prévia local iniciada a partir de `longbeach-edi-fix` (base publicada mais correção da consulta/rotação de chave webhook): web `http://localhost:5321`, API `http://localhost:5320`, banco existente `longbeach_profiles_preview`, contêiner `longbeach-perfis-test`. Banco preservado, backup restrito em `.runtime.local/preview-before-tab-notes.dump`; aplicada somente migration aditiva TabObservations. API e Vite limitados a loopback. `.env.homologacao.local` contém apenas credencial Sandbox; pagamentos, assinaturas e EDI permanecem desativados nesse runtime. A configuração de produção no Railway não foi alterada.

Verificação: API saudável; interface autenticada abriu Minha área; consultas de perfil, agenda, solicitações e contas responderam 200 com dados locais. A sessão disponível é de área pessoal; não foram concedidos papéis nem criados consumos. Correção de chaves: 26 testes unitários e 3 testes Python aprovados; builds API e frontend aprovados. Ainda não comprova checkout completo ou notificações do PagBank.

O formulário oficial exige URL/instruções de acesso e evidências de requests/responses. Localhost não é acessível pelo time PagBank; eventual túnel HTTPS restrito ou ambiente hospedado só deve ser preparado quando necessário e autorizado. Não enviar o formulário declarando um ambiente externo inexistente. Recorrência e acesso administrativo PagVendas seguem dependentes de validação/liberação oficial. Nenhum chamado foi enviado nesta rodada.
