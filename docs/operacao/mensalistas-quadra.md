# Mensalistas da quadra

A área `/mensalistas` guarda o grupo como um acordo contínuo, com todos os integrantes, responsável, suplente, modalidade, dia e horário fixos, vigência, situação, valor mensal, vencimento e regra para o quinto encontro. Telefones são opcionais. Grupos podem começar sem integrantes ou responsável; capacidade e vencimento desconhecidos ficam nulos. Reservas usam o nome da turma enquanto não há responsável cadastrado. Pessoas deixam o grupo por inativação, preservando IDs e histórico. Não há cadastros reais de exemplo nem ativação automática dos aluguéis históricos das planilhas.

## Fluxo da gestão

1. Cadastre o acordo e os integrantes conhecidos. Uma turma pode começar incompleta e receber os demais nomes depois. A quantidade prevista comporta até 50 pessoas, sem obrigar mínimo de quatro.
2. Abra a competência e revise todas as datas. O cadastro do acordo, sozinho, não ocupa a agenda; a confirmação gera os encontros do mês inteiro, respeitando a vigência e o funcionamento da quadra.
3. A validação consulta aulas, bloqueios e reservas da mesma quadra. Um conflito em qualquer data impede todo o lote. O quinto encontro pode ter horário reservado com acordo financeiro pendente; o total da competência fica a combinar até a definição. Cobrança automática exige total conhecido e vencimento confirmado. Valores desconhecidos permanecem `null`/“A combinar”. Não há rateio automático em mês parcial. Vencimentos no dia 29–31 usam o último dia disponível em meses mais curtos.
4. A caixa “Gerar também uma cobrança pendente” é opcional e começa desmarcada. Cria um único lançamento `Receber`/`Locações`, pendente, referenciado à competência. Sem essa opção, a cobrança pode ser cadastrada depois no financeiro, com origem, competência e vencimento preenchidos. Nada confirma pagamento automaticamente.
5. Os encontros entram na agenda com referência imutável ao grupo/mês e valor individual zero, apresentado como incluído no acordo mensal. A mensalidade fica exclusivamente no financeiro; é vedada uma cobrança vinculada à reserva individual de mensalista. Cancelamentos/remarcações se fazem na reserva e não recalculam a cobrança automaticamente. Pausar/encerrar/editar o acordo afeta gerações futuras; encontros e cobranças existentes são preservados.
6. Registre presença por encontro e integrante, a partir do dia correspondente. “Não informado” não conta como falta. O mês guarda os nomes dos integrantes ativos na geração; novos integrantes atuais também podem receber presença.
7. No bar, abra comandas no atendimento existente, depois vincule cada comanda ao encontro e, opcionalmente, a um integrante. Uma comanda só possui um vínculo ativo. É possível corrigir ou desvincular sem alterar consumos/pagamentos. Consumo usa itens aceitos/entregues menos ajustes; recebido usa pagamentos aprovados menos estornos; saldo é calculado por comanda. Os totais são da competência do encontro, independentemente da data em que o pagamento entrou. Isso é análise do grupo, não fluxo de caixa diário, receita adicional ou lucro. Nenhum acesso de cliente é compartilhado com a turma.

## Persistência e integridade

Registros aditivos versionados em `operational_records`: `rentalGroups`, `rentalMonths`, `rentalAttendances` e vínculo interno `rentalBarLinks`. Sem novas tabelas, migrations ou serviços externos. A camada Application valida regras e IDs determinísticos; Infrastructure coordena transações; Api aplica permissões; Contracts define entradas e saídas. A geração usa o mesmo advisory lock PostgreSQL `724031904` das reservas/importações, eliminando concorrência por horário entre réplicas. Grupo+competência e grupo+data geram IDs estáveis; repetir confirmações não duplica reservas nem mensalidades. IDs do vínculo são derivados da comanda, com inativação auditada ao desvincular. O financeiro impede segunda cobrança ativa da mesma competência e mudança silenciosa da origem de uma mensalidade.

Competências guardam versão do acordo, datas, política, valor e integrantes da geração. Edição otimista exige a versão atual; geração desatualizada é rejeitada. Repetição de um mês já gerado retorna o registro existente sem reconstruir reservas editadas. A opção de cobrança deve coincidir com a geração original; cobranças posteriores/canceladas são tratadas pelo financeiro. Toda persistência usa o interceptor de auditoria existente, sem tokens nem credenciais. Não há exclusão de cadastros nem importação implícita.

Permissões de projetos controlam grupos, agenda e presença. Financeiro controla valores e criação de cobrança. `bar:finance:read` controla totais por grupo; vincular exige também operação de vendas e escrita em projetos. Proprietários mantêm acesso; alunos sem papel administrativo não acessam o módulo. O modo local permite cadastro fictício, mas geração de meses e análise de comandas exigem conexão autenticada ao servidor.

## Publicação e reversão

Publicar API compatível antes da web, com commit fixado e CI aprovado. Rollback web/API para o incremento anterior mantém os novos registros JSON sem apagá-los, mas oculta o módulo; antes de reverter, considerar que reservas e lançamentos já gerados continuam fatos válidos da agenda/financeiro. Snapshot Railway por etapa, plano sem drift e confirmação de saúde conforme `deploy-railway-production.md`.

## Próximos incrementos possíveis

Lista de convidados, confirmação de presença antecipada, controle explícito de reposições, avisos autorizados ao responsável, comparação mensal de frequência e consumo, e acompanhamento de renovação. Não há envio de mensagens, benefícios financeiros ou renovação automática neste incremento.

## Registro de publicação — 2026-10-06

Runtime publicado no commit `6cfa56d62f565d7cd79dd0a5add9d3de2f6320e1`, branch `codex/mensalistas-quadra`; PR de revisão #13 com base no incremento de grade atual. CI `37462913661` concluído com sucesso (backend, frontend, conversores e smoke de migrations/saúde). Validação local: 130 unitários, 161 integrações PostgreSQL, 161 frontend, builds API/PWA, formulário conferido no Chrome e console local sem erros.

API `a3e5dbb8-e56d-4074-9a1b-435aa5747806` e web `227d11ca-7aae-4eda-ad6b-ac3b32131c6c` em `SUCCESS`, uma réplica saudável cada. API `/health/ready` = `Healthy`; web `/healthz` = `ok`. Comparação do snapshot confirmou apenas branch/commit de cada serviço, em etapas separadas. Plano final `No changes.`, sem diagnósticos, nenhuma variável ou serviço auxiliar alterado. Nenhuma migration nova ou grupo fictício gravado em produção.

Rollback do incremento: API `bb0ce23b-07cf-4cc5-9f46-0e310179775f` e web `60877a90-93a7-4b78-b378-ddc17239bd36`, commit `778c580517bc1240d7499ac95366f4c7dfa9805f`; preservar dados novos e revisar reservas/cobranças conforme orientações acima.

Conferência no Chrome autenticado em produção: atualização do PWA aplicada; menu Mensalistas disponível, listagem carregada e formulário aberto com Quadra 1 selecionada, horário editável de duas horas, integrantes, responsável/suplente, vencimento e política do quinto encontro. Retorno à listagem sem gravar dados fictícios. Evidência local fora do Git: `Integracoes/Arena/2026-10-06/mensalistas-producao.png` no workspace de operação.

## Importação de grupos confirmados

Pacotes `longbeach.rental-groups.v1` entram no staging comum e são conciliados em `/imports/{batch}/rental-groups`. Somente Owner pode revisar/aplicar; o esquema aceita apenas `rentalGroups`, em criação, com validação integral, versão zero, nomes únicos entre existentes e dentro do lote, fingerprint do estado e origem por registro. Aplicação atômica, auditada e idempotente, sem sobrescrever correções posteriores. A grade de aulas mantém esquema e tipos independentes no mesmo motor de staging.

Os pagamentos antigos são conciliados com as observações já existentes em Histórico financeiro. A importação de grupos não copia essas observações nem cria receitas, dívidas, datas de pagamento ou reservas. A geração explícita do mês confere conflitos com aulas e reservas em todas as datas. Com valor ou vencimento pendente, permite apenas encontros; cobrança posterior exige revisão explícita no Financeiro. Dados reais e pacotes de conciliação permanecem fora do Git.

Depois de aplicar grupos com integrantes vazios, capacidade/vencimento nulos ou competências sem total definido, mantenha uma API compatível com esses estados. A API anterior à importação pressupõe responsável e vencimento e pode falhar ao gerar o mês. Prefira correção para frente; não preencha pessoas ou vencimentos presumidos para permitir rollback. A retirada temporária da interface não apaga encontros já confirmados.

## Publicação da importação e dos estados pendentes — 2026-10-06

Runtime `ef2f91ac8c6a8454749dda38f816c1d9672c7ab0`, CI `37467013132` concluído com sucesso. Validação local: 130 unitários, 162 integrações PostgreSQL e 163 frontend; builds .NET/PWA aprovados. API `1f3adc8c-6d97-49f8-922f-a3a57be29f27` e web `8a92d4ca-a5fb-48d0-a480-acba7bb3a379`, ambas SUCCESS, uma réplica saudável. API publicada antes da web; sem migrations, alterações de variáveis ou serviços auxiliares. Comparações dos snapshots limitadas ao commit de cada serviço; plano final `No changes.`.

No Chrome autenticado, atualização do PWA aplicada, lote de grupos conferido e cadastrado e competências confirmadas com validação de todas as datas. Lista de Mensalistas, encontros e Agenda no período completo conferidos; nenhuma cobrança ou pagamento criado. Histórico conciliado com as fontes existentes, sem reimportar os valores. Console sem erros na conferência. Pacote, confirmação da gestão, conciliação e imagens de evidência ficam no workspace operacional, fora deste repositório.

## Revisão de UX/UI — 2026-10-16

A lista apresenta resumo compacto da competência selecionada, busca por grupo ou integrante, situação, dia da semana e filtro de pendências. Os cartões mostram integrantes ativos, responsável e avisos de cadastro incompleto ou encontros do mês ainda não confirmados. A pendência mensal considera situação ativa, vigência e existência da competência; não substitui a consulta de conflitos ao gerar encontros. Os filtros permanecem ao retornar da ficha ou cancelar um novo cadastro.

A ficha destaca os encontros da competência, o próximo encontro não cancelado e a ação de revisar o mês ou completar o cadastro. O formulário separa grupo/horário, integrantes e acordo financeiro; as duas últimas seções começam fechadas no cadastro novo. Campos inválidos abrem sua seção e recebem foco. O cadastro continua sem gerar reservas, cobrança ou pagamento automaticamente.

Validação local: 356 testes frontend aprovados (38 arquivos), incluindo filtros combinados, retorno à lista, vigência/competência e cancelamento sem escrita; build PWA e build do projeto API aprovados. A tentativa de build da solução inteira sem restore encontrou assets ausentes dos projetos de testes; o build explícito da API e suas dependências foi aprovado, sem avisos ou erros. Nenhuma mudança de backend ou migration neste incremento.

Conferência no Chrome em 1440 × 900, 390 × 844 e 320 × 740, com respostas locais fictícias e sem sessão de produção. Lista, ficha, revisão de encontros e formulário sem excesso de largura; navegação, filtros, cadastro mínimo e abertura de seção com campo inválido conferidos. Validação móvel por emulação de viewport, não em aparelho físico. Console sem erros. Evidências visuais permanecem fora do Git em `outputs/mensalistas-implementacao-2026-10-16/` no workspace. Publicação e validação autenticada em produção concluídas conforme registro abaixo.

## Publicação da revisão UX/UI — 2026-10-16

Publicação autorizada pelo proprietário nesta conversa. Web fixada no commit `772f83eac5a971b647639e52b95cb033e1412fd7`, branch `codex/mensalistas-ux-20261016`, após [CI 38940894259](https://github.com/gustavodrager/longbeach/actions/runs/38940894259) aprovada (frontend e backend com PostgreSQL 17 e 18). Revisão aberta: [PR #36](https://github.com/gustavodrager/longbeach/pull/36), encadeada na entrega da Agenda.

- Deployment web `01e5fb4a-8d35-4997-b7e5-9a86b6b64f60`, SUCCESS em 16/10/2026 às 19:20:25 UTC, uma réplica saudável. API mantida no deployment `b48d5990-4bde-4a3d-ae57-384401e9114d`.
- Patch revisado imediatamente antes de aplicar: somente branch e commit da web. Configuração restante, nomes de variáveis e domínios comparados antes/depois e preservados. Os outros cinco serviços mantiveram seus deployments; todos os seis online, sem falhas recentes nem trabalho pendente. Nenhuma migration ou mudança de dados.
- Snapshot importado antes e depois; planos confirmaram configuração atualizada e sem divergência. A importação reorganizou referências locais equivalentes à fonte GitHub, além de registrar a nova fonte da web. Nenhuma aplicação ampla de infraestrutura.
- `/mensalistas`, `/healthz`, `/health/live` e `/health/ready` responderam 200. HTML referencia `index-D58L-SXH.js`; módulos `RentalGroupsPage-7IeW6bR_.js` e `RentalGroupsPage-p33OLgRn.css` responderam 200.
- Chrome autenticado no perfil da Arena: atualização pela ação existente da PWA, preservando a sessão; lista, busca, retorno da ficha com busca preservada, filtro por dia, combinação com pendências e limpeza conferidos. Ficha mostrou próxima data e acesso aos encontros e à presença.
- Emulação móvel 390 × 844 e 320 × 844: lista, ficha, seletor de mês, datas e horários dos encontros e formulário com seções legíveis, sem cortes laterais no conteúdo principal. A navegação de seções mantém rolagem própria. Cadastro aberto, seção essencial recolhida e cancelamento retornou à lista sem salvar. Não houve teste em aparelho físico.
- A sessão anterior teve respostas 401 durante a espera; recarregar renovou a sessão. Após a atualização, o console permaneceu sem mensagens durante a conferência. DevTools mostrou recomendações em Issues, não auditadas neste incremento. Emulação desativada e janela devolvida à lista desktop com filtros limpos.
- Nenhum grupo, integrante, encontro, presença, cobrança ou pagamento foi criado ou alterado em produção. Evidências privadas e verificações HTTP em `outputs/mensalistas-producao-2026-10-16/` no workspace, fora do Git.

Retorno compatível: reverter somente a web ao deployment `6d1eed2c-b22c-46be-a404-7862131a097a`, commit `2ec1a67d4f037791427f44de437e3e0c6dd007b3`, branch `codex/agenda-ux-20261015`. Preservar API, banco, identidades e integrações; conciliar o snapshot e conferir atualização da PWA após eventual retorno.
