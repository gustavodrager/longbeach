# Homologação local por perfil — 10/10/2026

Status: cenários locais executados aprovados; homologação externa e aceite operacional pendentes. Não representa autorização para publicação.

## Ambiente e escopo

Cópia isolada `codex/perfis-acesso`, interface local na porta 5321 conectada à API na porta 5320. Banco de prévia com pessoas e operações fictícias. Suíte automatizada executada em banco exclusivo `longbeach_homologation_20261010_test`, separado da prévia. Nenhum pagamento real, envio ao repositório ou alteração em produção.

História verificada: cliente consulta disponibilidade e solicita aula → gestão confirma com professor → atividade ocupa a agenda e aparece para cliente/professor; professor registra presença; bar entrega um item e cliente consulta consumo e saldo; cada perfil respeita suas permissões.

## Evidências por fluxo

| Cenário | Evidência nesta rodada | Resultado |
| --- | --- | --- |
| Gestão abre Agenda | Semana 05–11/10 como padrão; 122 h livres e 4 h ocupadas antes da nova aula. Detalhe mostrou professor, capacidade 6, duas matrículas e aviso de cadastro atual. Escape devolveu foco ao bloco de origem. | Aprovado |
| Cliente consulta e envia pedido | Consulta de 11/10 retornou 07:00–24:00. Seleção preencheu 07:00–08:00. Pedido fictício foi exibido como enviado, sem garantir vaga. | Aprovado |
| Gestão confirma | Pedido chegou em acompanhamento; confirmação exigiu professora e preservou data/horário. Resposta visível na área do cliente. Banco contém exatamente um pedido desta rodada, `Confirmed`, 11/10, 07:00–08:00. | Aprovado |
| Disponibilidade após confirmação | API passou a retornar livre somente 08:00–24:00 no dia 11/10. | Aprovado |
| Professor recebe aula | Grade exibiu o novo encontro confirmado 07:00–08:00, separado das turmas regulares. | Aprovado |
| Presença | Bruno fictício passou de não registrado para presente; estado persistiu após recarregar e foi conferido no banco. | Aprovado |
| Funcionário do bar | Entrada em Vender; navegação restrita a atendimento. Comanda exibiu total R$ 22, pago R$ 5, saldo R$ 17. | Aprovado |
| Entrega → cliente | Suco fictício passou a Entregue; estado refletido na comanda do cliente. Banco contém dois itens entregues e um aguardando confirmação. Saldo permaneceu R$ 17. | Aprovado |
| Conta do cliente | Link da comanda selecionou a conta correta. Resumo permaneceu R$ 197 disponíveis, R$ 80 em confirmação e R$ 185 já pagos nas contas vinculadas. Pedido aguardando o bar permanece fora do total. | Aprovado |
| Restrições | Professor e bar tiveram acesso financeiro bloqueado no navegador. API confirmou bloqueios também para cliente. Matriz abaixo. | Aprovado |
| Celular | Comanda, pagamentos e agenda conferidos em 390 × 844, sem transbordamento horizontal. Evidências visuais salvas; dimensões restauradas ao terminar. | Aprovado nos cenários percorridos |
| Navegador e builds | Nenhum erro/aviso retornado pelo coletor do navegador na inspeção final. Build da interface passou; API compilada na execução completa dos testes. | Aprovado |

## Permissões verificadas diretamente na API

| Perfil | Contas financeiras da gestão | Gerenciar solicitações | Área de aulas do professor |
| --- | --- | --- | --- |
| Gestão | 200 | 200 | 200 |
| Professor | 403 | 403 | 200 |
| Bar | 403 | 403 | 403 |
| Cliente | 403 | 403 | 403 |

HTTP 200 indica acesso permitido; 403 indica bloqueio. A proteção não depende apenas de esconder itens do menu. Isolamento por aluno/turma/conta e rejeição de identificadores de terceiros também estão cobertos pelos testes de integração.

## Testes automatizados

705 testes aprovados nesta execução, sem falhas ou testes ignorados:

- 191 testes de regras de negócio.
- 250 testes de integração, com PostgreSQL exclusivo.
- 264 testes da interface, em 31 arquivos.

Cobertura relevante: disponibilidade, união de ocupações sobrepostas, intervalos parciais e consecutivos, meia-noite, funcionamento pendente/fechado, início de turmas, redução de dados por permissão, confirmação concorrente e repetida, aceitação de proposta pelo titular, retirada/cancelamento, presença em turma autorizada, cadastro Google com validação de tokens em teste, isolamento de contas, pagamento parcial, confirmação de pagamento, recorrência mensalista sem duplicação e redirecionamentos antigos preservando contexto.

Esses resultados não equivalem a testar cada regra manualmente no navegador, nem a homologar provedores externos.

## Pendências para homologação completa

| Pendência | Condição para concluir |
| --- | --- |
| Google real | A prévia retorna Client ID ausente e cadastro desativado. Configurar aplicação/origem de homologação e executar entrada, cadastro e retorno com conta de teste. O cadastro fictício utilizado nesta rodada não comprova OAuth real. |
| PagBank sandbox | Pix, cartão e recorrência retornam desativados. Configurar credenciais exclusivamente sandbox e callback de homologação; conferir criação, confirmação, recusa/expiração, repetição e conciliação. Nenhuma cobrança real foi tentada. |
| Venda nova no navegador | Prévia sem saldo físico de estoque: bloqueio exibido corretamente. Preparar estoque e caixa fictícios para percorrer venda completa. Testes automatizados do atendimento e pagamentos passaram, mas não substituem este aceite operacional. |
| Dispositivos reais | Validação móvel foi por viewport. Ainda conferir aparelhos usados pela equipe, inclusive interação por toque. |
| Aceite da operação | Gestão, professor e atendente revisarem os cenários com regras comerciais, horários, cadastro e participantes representativos. Mensalistas/eventos não foram percorridos manualmente nesta rodada. |

Não foi identificada falha funcional nos cenários executados que exigisse alteração de código nesta rodada. A homologação permanece parcial até concluir as pendências acima.

## Dados fictícios alterados na prévia

Preservados para revisão: pedido/aula de 11/10/2026 das 07:00 às 08:00 com mensagem de homologação; presença de Bruno em Iniciantes no dia 10/10; entrega do suco da comanda 1. Os dados anteriores permanecem. Nenhuma dívida nova foi criada pelo fluxo de confirmação; o cliente continuou com quatro contas vinculadas e o mesmo saldo disponível.

## Próximo passo

Preparar estoque e caixa de demonstração para o aceite do atendimento. Concluir configuração própria de Google e PagBank sandbox, então repetir a homologação externa. Publicação e envio ao repositório continuam sujeitos a aprovação específica.

## Complemento — venda completa e fechamento do bar

Rodada local concluída em 10/10/2026, após o relatório acima. A pendência de venda nova em navegador está resolvida para o cenário de dinheiro com troco.

- Criado produto separado `HOMOLOG-AGUA`, Água · homologação, preço fictício R$ 5 e controle de estoque ativo. Os produtos anteriores foram preservados.
- Contagem inicial de 20 unidades aprovada pela API com justificativa. Lote transferido por movimento auditado do local de demonstração para o local **Bar**, utilizado pelo atendimento. A primeira consulta vazia correspondia ao local sem estoque, não a uma falha de venda.
- Atendente fictício abriu **Caixa · homologação local** com R$ 50 pela interface.
- Selecionou duas unidades, conferiu R$ 10 e registrou/entregou o pedido. API confirmou estoque final de 18 unidades e zero reservado.
- Registrou recebimento simulado de R$ 20 em dinheiro, com troco de R$ 10. Comprovante exibiu pagamento aprovado de R$ 10 e saldo zero.
- Caixa mostrou R$ 60 esperados. Fechamento com R$ 60 contados produziu diferença zero.
- Comanda 2 foi encerrada pela interface; nova consulta na API confirmou `Closed`, total R$ 10, pago R$ 10 e saldo zero. Caixa também permaneceu `Closed`.
- Coletor do navegador não retornou erros/avisos ao final. Nenhuma alteração de código de aplicação foi necessária; a suíte de 705 testes aprovada na rodada anterior não foi repetida por mudanças apenas em dados de demonstração e documentação.

Os valores desta rodada são registros de simulação em banco local; não houve recebimento real nem chamada de pagamento externo. Google, PagBank, dispositivos reais, mensalistas/eventos em uso manual e aceite da equipe continuam pendentes. A preparação da próxima rodada está em `proxima-rodada-google-pagbank.md`.
