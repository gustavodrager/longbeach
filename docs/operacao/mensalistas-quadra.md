# Mensalistas da quadra

A área `/mensalistas` guarda o grupo como um acordo contínuo, com todos os integrantes, responsável, suplente, modalidade, dia e horário fixos, vigência, situação, valor mensal, vencimento e regra para o quinto encontro. Telefones são opcionais. Pessoas deixam o grupo por inativação, preservando IDs e histórico. Não há cadastros reais de exemplo nem ativação automática dos aluguéis históricos das planilhas.

## Fluxo da gestão

1. Cadastre o acordo e cada integrante. Uma turma pode começar incompleta e receber os demais nomes depois. A quantidade prevista comporta até 50 pessoas, sem obrigar mínimo de quatro.
2. Abra a competência e revise todas as datas. O cadastro do acordo, sozinho, não ocupa a agenda; a confirmação gera os encontros do mês inteiro, respeitando a vigência e o funcionamento da quadra.
3. A validação consulta aulas, bloqueios e reservas da mesma quadra. Um conflito em qualquer data impede todo o lote. O quinto encontro exige acordo definido: incluído ou adicional conhecido. Valores desconhecidos permanecem `null`/“A combinar”. Não há rateio automático em mês parcial. Vencimentos no dia 29–31 usam o último dia disponível em meses mais curtos.
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
