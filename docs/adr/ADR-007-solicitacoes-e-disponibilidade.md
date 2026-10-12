# ADR-007 — Solicitações de aula e reserva

Status: implementado e validado na cópia local. Sem publicação ou alteração de produção.

## Fluxo

O cliente consulta intervalos livres por data, escolhe um início e envia sua preferência. A duração inicial é de até uma hora, limitada ao intervalo; início e término continuam editáveis. A única quadra é selecionada automaticamente, preservando o vínculo interno. Cadastros legados com várias quadras mantêm seleção explícita.

A consulta não segura horário nem garante professor. Pedidos pendentes não ocupam a quadra. A gestão pode colocar em análise, confirmar o horário pedido, propor alternativa ou informar indisponibilidade. Alteração de horário exige proposta aceita pelo cliente. Na confirmação ou aceite, a API verifica novamente funcionamento, conflitos, professor, versão do pedido e regras existentes, dentro da mesma transação e do bloqueio operacional já utilizado.

A aula experimental é um encontro individual fora da grade regular, conforme o fluxo já existente. Não cria matrícula nem altera capacidade de turmas. Sua reserva possui `activityKind=Trial`, mantém identidade de reserva para alterações/cancelamento e é identificada como aula experimental na Agenda. Horas de aula experimental entram no total de aulas; não são contabilizadas também como locação. A agenda do professor vinculado passa a mostrar encontros confirmados dos próximos 60 dias, incluindo chegada/conclusão, sem dados financeiros, contatos ou observações administrativas.

## Privacidade e estados

`GET /api/v1/me/portal/availability?date=...&courtId=...` exige sessão e retorna apenas data, quadra, estado e intervalos livres. Não retorna reservas, aulas, nomes de terceiros ou seus identificadores. Usa o mesmo cálculo de disponibilidade da Agenda. Intervalos já iniciados são limitados ao próximo minuto no dia atual. Falha de consulta, configuração pendente ou inexistência de quadra não geram disponibilidade fictícia. Fechamento, manutenção, cancelamentos e aulas seguem as regras de funcionamento existentes.

`POST /api/v1/me/portal/requests/{id}/withdraw` permite ao próprio cliente retirar pedido enviado/em análise ou recusar uma alternativa, usando versão. O estado terminal é `Withdrawn`. Repetição da mesma retirada é idempotente. Pedido confirmado deve seguir solicitação de cancelamento; retirada de pedido não cancela um compromisso anterior. A transação evita disputa com decisão/aceite, e o histórico registra a retirada. A gestão vê esses pedidos entre as concluídas.

O cliente continua podendo enviar uma preferência manual para análise quando não houver intervalo disponível, sem promessa de vaga. A gestão não consegue confirmar um horário conflitante. A confirmação exige valor informado (inclusive zero) e professor para experimental. Não cria cobrança automaticamente; integração de pagamentos permanece na etapa seguinte.

## Validação

- Testes de disponibilidade: aulas e bloqueios, cancelamentos que liberam horários, intervalo parcial, horário atual, funcionamento pendente e dia fechado; nenhuma identidade de terceiros na resposta.
- Testes de retirada: propriedade, versão, repetição, histórico e preservação da reserva confirmada.
- Testes de aula experimental: classificação e minutos na Agenda, visibilidade apenas ao professor vinculado, chegada e cancelamento, ausência de dados financeiros na resposta do professor.
- Interface: preenchimento até uma hora e fim às 24h, quadra única, falha de consulta, recusa de proposta, confirmação pela gestão com professor, pedidos retirados nas concluídas.
- Regressão: 191 testes unitários, 249 de integração e 252 da interface passaram; builds da API e interface concluídos. A alteração final de chegada/cancelamento também teve teste específico após a suíte completa.
- Prévia com PostgreSQL e dados fictícios: pedido experimental enviado pela interface do cliente e confirmado pela gestão. A mesma atividade foi conferida nas APIs do cliente, professor e Agenda. A consulta seguinte passou de 06:00–24:00 para 07:00–24:00 após a confirmação de 06:00–07:00. Conferência visual no desktop e celular (390px, sem rolagem horizontal).

Não houve pagamento, envio a terceiros, push, deploy, migration ou ativação do Google. A homologação Google real continua pendente de configuração conforme ADR-006. A chamada de turmas regulares permanece separada; registro de presença para encontros avulsos não foi acrescentado.
