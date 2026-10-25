# Consulta de pagamentos sem conciliação manual

Decisão do proprietário em 25/10/2026: retirar a conciliação PagBank e facilitar a consulta dos pagamentos. A versão da aplicação `42f2ffeae2c7424dafecb4862e0c211664edddfa`, preparada a partir da release financeira Google `ee33a37`, foi autorizada e publicada em produção no Google em 25/10/2026. O proprietário cancelou a preparação adicional de homologação e determinou priorizar economia e reaproveitamento.

## Fluxo de consulta

Recebimentos reúne busca por conta ou responsável, filtros de situação e Bar/Quadra e valores da seleção. Os detalhes de cada conta mantêm pagamentos, estornos, origem e comprovantes. Contas e lançamentos sem responsável financeiro vinculado também aparecem na gestão, com acesso ao registro original.

As telas de vínculo manual entre liquidação EDI e pagamento e de cadastro manual de taxas deixam de existir. Os endereços antigos `/recebimentos/conciliacao`, `/recebimentos/conciliacao-bar` e `/bar/conciliacao` redirecionam para `/recebimentos`. O detalhe do pagamento conserva as taxas históricas como informação de leitura.

Os endpoints manuais de settlements e reconcile são retirados. A permissão de conciliação sai do catálogo ativo. Consultas de pagamentos e atualização de situação continuam protegidas pelas permissões financeiras; cobrança e estorno conservam suas permissões próprias.

## Valores e origem

- Recebido registrado usa o valor pago da origem, após os estornos confirmados e antes das taxas. Não representa saldo disponível na conta bancária.
- Em confirmação conserva somente tentativas de pagamento ainda pendentes. Esses valores não são adicionados ao recebido nem ao saldo disponível para um novo pagamento.
- Saldo a receber usa o valor ainda disponível para pagamento na conta de origem.
- Estorno em confirmação permanece no recebido até a confirmação efetiva da devolução.
- Taxa ausente continua indisponível; não é estimada como zero.

A consulta administrativa conserva as contas vinculadas e acrescenta comandas do Bar e lançamentos elegíveis da Quadra sem vínculo. O par tipo/origem impede reapresentar uma conta vinculada como outra conta sem vínculo. A leitura ocorre no mesmo snapshot para manter essa seleção consistente durante a criação de um vínculo.

As projeções sem vínculo usam `isLinked=false` e não criam contas, pagamentos, baixas ou auditorias de escrita. Comandas reutilizam o cálculo original de consumo, descontos, pagamentos e estornos. Lançamentos elegíveis da Quadra usam a situação informada no lançamento; um lançamento pago sem transação vinculada é identificado como pagamento informado pela equipe. Não é fabricado um identificador de transação bancária para esse caso.

As projeções abrem a comanda ou o lançamento original. Ações que dependem de uma conta de cobrança vinculada permanecem disponíveis somente nas contas vinculadas. A área do cliente conserva o filtro de suas próprias contas; não recebe projeções administrativas.

A lista administrativa atualiza a cada minuto. A leitura do Bar carrega comandas, itens, pagamentos e estornos pendentes em quatro consultas em lote, reutilizando o cálculo original; não consulta o provedor nem carrega histórico de ações por comanda. Contas vinculadas da Quadra conservam seu carregamento individual. A lista ainda retorna o histórico completo, sem truncamento silencioso.

Documentos EDI, resumos PagVendas e extratos continuam preservados como fontes de consulta. Não são somados outra vez aos pagamentos da operação. Lançamentos gerais que não representam contas elegíveis da Quadra e vendas do fluxo antigo permanecem em suas consultas de origem; o resumo de recebimentos não é um consolidado de toda movimentação bancária ou de despesas.

## Preservação e publicação

Históricos de vínculos e taxas anteriores, documentos bancários, pagamentos e estornos permanecem guardados. Não há exclusão de tabelas nem nova migration para esta alteração. As rotinas automáticas de confirmação e os bloqueios de repetição, valor, moeda, vínculo e operação pendente continuam ativos.

Antes de promover, conferir os testes da interface, as rotas manuais removidas, os fluxos automáticos de pagamento/estorno e a leitura administrativa em PostgreSQL sintético. Conferir a tela em desktop e celular com dados fictícios. A promoção deve identificar o commit e os artefatos aprovados do Google; não reaplicar migrations ou dados de homologação.

O chamado PagBank sobre os estornos de Sandbox e a liberação oficial da integração permanecem processos independentes desta simplificação da consulta.

## Verificação local

A interface passou em 495 testes e no build TypeScript/Vite. A prévia no navegador usou somente dados fictícios e consultas em memória, com operações financeiras e conexões externas bloqueadas. Foram conferidos busca sem acentos, filtros combinados, totais, detalhamento de comanda sem vínculo, ausência de ações inválidas, layout em desktop/celular e falha de consulta sem exibir totais antigos como atuais. Esse ensaio visual não é uma validação da API publicada ou do PagBank.

Os testes PostgreSQL verificam leitura sem gravações, fontes sem vínculo, isolamento entre usuários, ausência de duplicidade durante vínculo concorrente e quantidade constante de consultas para comandas do Bar com vários pagamentos. As rotas de conciliação removidas retornam 404 inclusive para a gestão. Os fluxos automáticos de confirmação e estorno continuam cobertos pelos testes de integração.

## Publicação em produção

Foram aprovados 495 testes da interface, 443 testes unitários da API e 153 testes de integração PostgreSQL selecionados, além dos builds da API e da interface. A API publicada usa o índice OCI `sha256:9c18b3d5029da31368ddac916ca9507b5a6639bc990a84b28e7faa88e4cdc17d`, revisão Cloud Run `longbeach-api-00005-7fz`, com 100% do tráfego. A versão Firebase é `sites/parsero-prod-20261022/versions/1d64e4cdfa5a9167`.

A promoção atualizou as imagens da API e do job de migrations, sem executar o job ou alterar banco, integrações, permissões ou DNS de produção. As consultas públicas de saúde, exigência de autenticação e CORS foram verificadas. Os 72 arquivos públicos da interface correspondem ao artefato aprovado; os dois arquivos adicionais do manifesto hospedado são os caminhos reservados gerados pelo próprio Firebase.

A tela real de [Recebimentos](https://longbeach.quebranunca.com.br/recebimentos) foi conferida com a sessão já autorizada: pesquisa, totais da seleção, detalhamento de uma comanda sem responsável vinculado e ausência da conciliação na navegação. Essa conferência foi somente de leitura, sem criar cobranças, registrar pagamentos ou solicitar estornos. O resumo continua sujeito ao escopo de contas operacionais descrito acima.

## Revisão da consulta em produção

A revisão do frontend `e30a43822cc69ff49b414d69039df6e6d61bfb6d` foi publicada em 25/10/2026 às 22:47 UTC, na versão Firebase `sites/parsero-prod-20261022/versions/2fde9a85bc062014`, release `sites/parsero-prod-20261022/channels/live/releases/1792968427520000`. O artefato tem SHA256 `4518f9ae3d2a2bb19a225e89d25fe4952804fd2f54126cee63adbfc8cc8b1585`. A API permanece em `42f2ffe`, revisão `longbeach-api-00005-7fz`; não houve alteração de banco, migrations ou infraestrutura.

A lista passa a priorizar pagamentos/estornos em confirmação, contas vencidas e contas a receber. O filtro Vencidos considera somente saldo exigível com vencimento anterior ao dia atual de São Paulo, excluindo cancelamentos. As demais contas preservam o histórico; as recebidas usam as datas disponíveis para mostrar os pagamentos mais recentes primeiro. A ordenação não altera os dados nem executa conciliação.

O cartão mostra o último pagamento confirmado quando sua data existe. Histórico e comprovante usam o horário de São Paulo, enquanto vencimentos permanecem datas civis. Comprovantes distinguem estornos confirmados parciais/totais e pedidos ainda em confirmação. Não é fabricada uma data para pagamentos informados diretamente no lançamento.

A consulta exibe a hora da última leitura. Falhas na lista de responsáveis têm aviso e nova tentativa, pausando explicitamente a pesquisa por nome e o vínculo até recuperar a consulta. Uma sessão expirada orienta a entrar novamente. Retomada e checkout administrativos exigem permissão de escrita; consulta de confirmação e comprovantes permanecem acessíveis conforme a permissão de leitura.

A suíte frontend passou com 519 testes antes do ajuste final da sessão; os 71 testes focados da versão final e o build TypeScript/Vite passaram. A prévia local conferiu filtros, totais, ordem e leitura em tela ampla e celular, somente com dados fictícios e rotas locais de leitura. Os 72 arquivos públicos publicados, suas rotas, hashes e cabeçalhos foram comparados com o artefato. Busca, filtro Vencidos, origem e histórico foram conferidos também com os dados de produção, sem operações financeiras. Nenhum novo ambiente ou banco de homologação foi criado.

## Cancelamento da preparação adicional de homologação

A preparação chegou a criar um database vazio, quatro recipientes vazios de segredos e sete recursos de endereço/certificado, além do guard Terraform. Em seguida, o proprietário cancelou esse ambiente e orientou economizar o máximo possível. Os 13 recursos foram removidos por plano completo revisado; os 33 recursos anteriores de staging, o database `longbeach` e as execuções anteriores foram preservados. O IP reservado foi liberado. Não foram criados usuários SQL ou valores de credenciais, nem executadas migrations ou contas fictícias nesse database.

Os três registros DNS temporários também foram retirados. A conferência da zona confirmou exatamente os 25 registros originais, incluindo os endereços de produção. Não foi necessário criar backup para excluir os recursos vazios desta preparação. A orientação de economia permanece nas regras do repositório; um novo ambiente hospedado só deve ser preparado quando houver necessidade concreta.

A publicação estática temporária de staging foi desativada com um release `SITE_DISABLE`; o endereço padrão voltou a responder 404, mantendo o site e os artefatos anteriores. O processamento da instância antiga `parsero-staging-postgres`, sem API ou jobs em execução e com amostras recentes de zero conexões nos databases remanescentes, foi suspenso em 25/10/2026 às 15:20 UTC. O estado confirmado é `STOPPED`, com `activation_policy=NEVER` persistido na configuração. Instância, database `longbeach`, dados, backups existentes e job foram preservados. Armazenamento e IP anteriores continuam sujeitos a cobrança; não se trata de custo total zero.

Antes de reutilizar esse staging, restaurar explicitamente `staging_database_activation_policy=ALWAYS` e conferir a necessidade do ambiente. A produção conserva `ALWAYS`, a revisão publicada e a configuração anterior. Os 33 testes de infraestrutura passaram, incluindo a recusa de suspender produção ou staging com API, workers ou databases de outros clientes habilitados.
