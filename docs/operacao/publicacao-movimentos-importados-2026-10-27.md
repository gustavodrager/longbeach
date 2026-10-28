# Movimentos importados na Visão geral e em Recebimentos — 27/10/2026

A interface da fonte `dc59e81a0ea7e6423752976196781a62bed9bfaa` foi publicada no Firebase às 23h21m42.254s UTC (20h21m42 de Brasília). A API permanece na fonte `b71dbf22127a6475b91770ba8f643df7933330b9`, com schema 28. O [registro atual](release-google-vm.json) separa as fontes e aprovações. A verificação pública e a conferência autenticada em produção foram concluídas com sucesso.

## Alteração

A Visão geral e a área administrativa de Recebimentos apresentam um bloco comum de movimentos bancários importados, com banco, competência, entradas, saídas e acesso à origem. A prévia mantém a origem de cada linha e o link para o histórico conserva banco e mês. Seus totais usam a consulta completa do período, independentemente da quantidade de linhas visíveis na prévia.

Os movimentos não são convertidos em contas ou pagamentos e não entram nos totais de recebido, pendente ou a receber das contas. O fluxo líquido do extrato não é tratado como saldo bancário atual. O período do bloco é próprio, separado do filtro de resultados operacionais. A troca de banco não conserva os valores do banco anterior durante a carga; ausência de dados e erro de consulta têm estados distintos. O C6 depende de extrato importado para apresentar movimentos.

A mudança reutiliza a API de histórico existente e o cache da aplicação. Não reativa consultas a PagBank, PagVendas ou C6, nem introduz atualização periódica de trinta segundos. Nesta publicação não houve importação, cobrança, estorno, edição de contas ou movimentos de negócio.

## Validação e aprovação

A suíte frontend aprovou 585 testes em 61 arquivos; a conferência dirigida após o ajuste de tipos aprovou 59 testes em 2 arquivos. TypeScript e build PWA passaram. O artefato de produção foi congelado a partir do commit por `git archive`, com configuração pública de autenticação capturada novamente, lockfile, configuração Firebase e hashes completos. Não foi reconstruído durante a promoção.

O workflow [release-images.yml, run 40599108643](https://github.com/gustavodrager/longbeach/actions/runs/40599108643) aprovou os três jobs de qualidade — backend com PostgreSQL 17/18 e frontend — na tentativa 1. O job Publish foi bloqueado pela política de branch do environment. Após autorização específica do proprietário, somente a branch deste ajuste foi liberada temporariamente; apenas o job falho foi reexecutado. A tentativa 2 recebeu a aprovação oficial do proprietário em Production e concluiu com sucesso, preservando a prova anterior do mesmo SHA. Nenhuma imagem API produzida por esse workflow foi implantada. Não foi criado PR para esta alteração; o PR48 permanece referência histórica da publicação de materiais.

O build local da API foi interrompido após a validação remota equivalente, conforme recibo específico; não é apresentado como build local aprovado. O conteúdo backend permanece igual à fonte da API em execução. Os recibos históricos da API não foram reexecutados ou atribuídos à nova interface. Os 27 testes locais dos helpers cobriram gate e SHA exatos, IDs reais dos jobs originais, seleção da tentativa mais recente, recusa de tentativa futura ou qualidade mais recente falha, TLS, hashes completos e impedimento de repetição após resultado incerto.

A permissão temporária foi removida às 23h24m28.398s UTC. O recibo confirma as regras originais restauradas, o reviewer preservado e a remoção exclusiva da regra criada para esta publicação.

## Publicação e prova pública

| Registro | Valor |
| --- | --- |
| Fonte web | `dc59e81a0ea7e6423752976196781a62bed9bfaa` |
| Versão Firebase | `sites/parsero-prod-20261022/versions/c6b5e6266e9cab5f` |
| Release | `sites/parsero-prod-20261022/channels/live/releases/1793143302254000` |
| Publicação UTC | `2026-10-27T23:21:42.254Z` |
| Verificação pública UTC | `2026-10-27T23:22:08.386785+00:00` |
| SHA256 da árvore pública | `a80b66bdf74a5085db941f89e09c1dc20c6965b29d2c6d10a06d5d5199acbc2e` |
| Arquivos conferidos | 73, todos iguais ao artefato |
| Rotas SPA | 6: Visão geral, Recebimentos, histórico financeiro, materiais, produtos e importações |
| Configuração | Headers/TLS e Firebase preservados; metadados privados não publicados |

A captura prévia e o plano novos v2 foram vinculados ao mesmo artefato; os arquivos v1 foram preservados. A publicação invocou uma vez o CLI oficial Firebase 15.34.1 para hosting. A verificação posterior foi somente GET, com token de provedor apenas em memória/descritor, inventário completo e identidade live estável. A única prova atual da API nesta operação foi GET público `/health/ready` 200. Não houve nova inspeção da VM, contêineres, schema ou hashes do banco, nem novo backup, migration ou restauração.

## Conferência autenticada

O recibo final de produção, concluído às 23h29m41.936s UTC, aprovou as duas telas com competência e origem visíveis, troca entre Setembro e Outubro, histórico completo e abertura do modal de origem. O período bancário foi conferido independentemente do filtro de resultados operacionais; os pagamentos das contas permaneceram separados dos movimentos importados. A ausência de movimentos C6 apresentou aviso próprio, sem totais monetários falsos.

A prévia foi recolhida e Outubro restaurado ao terminar. A sessão autorizada permaneceu em Recebimentos. Não houve escrita de negócio, consulta aos provedores bancários, acesso a credenciais da aplicação ou infraestrutura adicional. Os valores financeiros, nomes, documentos e o conteúdo real observado permanecem somente nas evidências privadas.

## Evidências e retorno

As evidências privadas estão em `LongBeach/evidencias/movimentos-importados-2026-10-27/`. Os hashes novos `web_imported_movements_*` no registro da release vinculam autorização específica, plano e gate v2, JSONs oficiais do GitHub, captura Firebase, publicação, verificação pública, conferência autenticada, testes e remoção da permissão temporária. Os hashes históricos de API e web anterior permanecem intactos.

O ponto anterior da web é `sites/parsero-prod-20261022/versions/ae06ef2686f65734`, fonte 90dc344. Um retorno exige nova autorização e revisão e atua somente no Firebase, mantendo API b71 e schema 28. Não executar Down, reabrir escritores antigos ou restaurar sobre o banco ativo. Esta operação não executou retorno. Os backups e comprovantes anteriores permanecem preservados; esta publicação somente web não exigiu novo backup do banco.
