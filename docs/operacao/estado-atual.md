# Estado atual do Long Beach OS

Referência conferida em 08/10/2026 (America/Sao_Paulo). Este documento descreve a aplicação existente; os documentos da primeira release e o pacote de setembro são referências históricas, não inventário de funcionalidades ausentes.

## Versão e evidências

A referência da implantação é [release-producao.json](release-producao.json), conferida com Railway e GitHub. API e web usam `99f81448b83a4d54e725d456b00d128db92c61cc`; CI `37715620674` concluída com sucesso. O runbook registra 163 testes unitários, 213 de integração e 208 de interface. A revisão #20 foi integrada em `codex/saldos-pagina-inicial`; `main` ainda aponta para uma revisão anterior. Não publicar `main` presumindo que representa produção.

Os seis serviços estavam online, sem falhas nas oito horas anteriores à consulta, sem alterações pendentes. Isso comprova estado de implantação, não reconciliação dos dados nem restauração de backup. API e web têm uma réplica cada; PostgreSQL usa imagem 18 e volume próprio. Serviços `*-operations` permanecem preservados.

Este manifesto é uma fotografia datada, não um monitor. Em cada publicação, comparar o commit efetivamente executado por **ambos** os serviços com a CI e atualizar manifesto, runbook e snapshot Railway no mesmo incremento documental. Uma branch que avance não muda a identidade da release fixada por commit.

## Mapa funcional vigente

| Área | Implementado | Limite operacional |
|---|---|---|
| Identidade | Contas individuais, papéis, permissões, sessão web/mobile, acesso Google e auditoria | Independente da plataforma QuebraNunca |
| Agenda | Quadras, funcionamento, aulas, reservas, bloqueios, conflitos, recorrência e versão de edição | Agenda não conferida não pode ser apresentada como capacidade livre confirmada |
| Mensalistas | Acordo, integrantes, competência, encontros, quinto encontro e presença | Cadastrar acordo não gera encontros; gerar encontros não implica cobrança ou pagamento |
| Escola | Alunos, professores, turmas, matrículas e presença | Cadastros e vínculos financeiros pendentes exigem conferência |
| Bar | Catálogo, estoque, compras, comandas, caixa, pagamentos e vínculos com encontros | Consumo, recebido, saldo de comanda e caixa são medidas distintas |
| Financeiro | Lançamentos, histórico importado, controle mensal, despesas por tipo e saldos | Histórico sobreposto e liquidação EDI não são receitas adicionais |
| Cobranças | Conta vinculada ao responsável, pagamento, recuperação, assinatura e estorno | Código publicado com novas cobranças integradas desabilitadas |
| Integrações | Staging, proveniência, catálogo importado, adaptador PagBank e coletor EDI | Importação pontual de catálogo não é sincronização automática |

## Conferência prioritária

1. Executar [auditar-operacao.sql](../../scripts/auditar-operacao.sql) por conexão administrativa existente, somente leitura, na competência escolhida. Guardar apenas o resumo agregado fora do Git. Erros de integridade exigem investigação; pendências não autorizam gerar dívidas nem dar baixa.
2. Conferir grupos ativos sem competência, competências sem cobrança e valores/vencimentos desconhecidos com a gestão. Remarcação ou cancelamento de encontro não muda a mensalidade automaticamente. Lançamentos existentes são a referência da cobrança; histórico importado não deve ser convertido automaticamente em dívida.
3. EDI: as variáveis Enabled, User e Token existem, mas **StartDate está ausente**; o worker exige uma data explícita e encerra a inicialização sem ela. A tela de integrações calcula `Aguardando configuração`. Definir o início com o proprietário, publicar a configuração por fluxo controlado e comprovar primeira leitura, cursor D+1 e conciliação de amostra. Não inferir coleta ativa apenas da flag Enabled.
4. Pagamentos: envio do formulário de homologação consta no runbook de hoje; aceite do provedor, estorno de cartão, autenticidade de notificação e recorrência permanecem sujeitos a comprovação. Preservar flags de criação desabilitadas e a mesma identificação nas retomadas incertas.
5. Backup: obter evidência de backup real e restauração em ambiente isolado, incluindo migrations, contagens, integridade e tempos medidos. O teste sintético de CI não equivale a restauração de produção. RPO/RTO continuam a definir com o responsável.

## Evolução técnica incremental

Preservar o monólito modular e a independência do produto. Filtrar a leitura diária da agenda no banco antes de materializar o histórico. Manter os bloqueios e a validação atômica de escrita; reduzi-los exige teste de concorrência e medição. JSON operacional pode evoluir por entidade para modelos tipados, com migração aditiva e reconciliação; não converter tudo neste incremento.

O CI passa a verificar PostgreSQL 17 (compatibilidade com o desenvolvimento existente) e 18 (versão principal da imagem de produção). Não trocar a imagem de um volume local PostgreSQL 17 por 18: upgrade major exige migração própria. O ensaio de backup do CI opera exclusivamente em bancos fictícios `longbeach_ci` e `longbeach_restore_check`.

## Limites desta conferência

Nenhuma transação financeira ou correção de cadastro é autorizada pelo relatório. Estado real de agenda/cobranças, backup de produção e aceite PagBank precisam de evidências próprias. Tracing Railway está desligado; isso não comprova ausência de outras formas de logs ou alertas. A inspeção visual anterior foi impedida pela verificação de segurança do navegador; não foi usada como evidência de UX nesta rodada.
