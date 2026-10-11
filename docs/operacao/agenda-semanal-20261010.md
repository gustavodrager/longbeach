# Agenda semanal — entrega local para revisão

## Resultado

A Agenda abre na semana atual, de segunda a domingo. O painel informa horas livres, ocupadas sem duplicidade, aulas e encontros de mensalistas, com locações e bloqueios discriminados. No desktop, sete colunas posicionam atividades por horário; no celular, os dias aparecem em sequência. Dia e Lista continuam disponíveis e seus links explícitos foram preservados.

A operação com uma quadra não repete “Quadra 1” na Agenda nem pede escolha nos formulários de reserva simples e recorrente. O vínculo interno permanece; a seleção automática também funciona depois do carregamento assíncrono dos dados.

Atividades abrem um painel de detalhes operacionais, com retorno de foco ao fechar. Aulas mostram cadastro atual, professor, matrículas e alunos conforme permissões. Mensalistas usam o vínculo rentalGroupId e os participantes registrados no mês, com fallback explicitamente identificado para cadastro atual. Recorrência avulsa não é classificada como mensalidade. Não foram adicionadas cobranças ao painel.

Intervalos livres abrem reserva com data, início e término de até uma hora, limitado à janela. A validação de conflito continua no servidor. A confirmação de uma alteração invalida imediatamente a consulta de disponibilidade; não depende do intervalo automático de 30 segundos.

## Contrato e regras

As respostas existentes de agenda diária e por período recebem campos aditivos em CourtScheduleRow:

- occupiedMinutes: união dos intervalos de ocupação registrados, sem duplicidade, inclusive atividades fora do funcionamento que precisam de atenção.
- freeIntervals: lista de startTime/endTime dentro do funcionamento, descontando a união das ocupações; null quando o cadastro está pendente e lista vazia em fechamento ou manutenção confirmados.

Aulas e locações preservam duração individual; sobreposições ou atividades fora do funcionamento são alertadas. Campos agregados antigos mantêm seus significados. Blocos totalmente fora do horário agora permanecem visíveis. Reserva cancelada não ocupa nem aparece no calendário diário/semanal, mas permanece consultável na lista.

Filtros na semana destacam resultados, sem liberar as ocupações restantes. O resumo considera a semana inteira. Falha de consulta, cadastro pendente ou acesso insuficiente não oferecem lacunas como livres. Falta dos novos campos em API antiga resulta em disponibilidade a confirmar, não em cálculo otimista no navegador.

Não há migration, alteração de política comercial ou configuração de produção. Regras de fim de semana e quinto encontro permanecem inalteradas.

## Evidências de validação

- 235 testes da interface aprovados, em 27 arquivos.
- 190 testes unitários da aplicação aprovados.
- 9 testes de integração relevantes aprovados no PostgreSQL 18, sem testes ignorados.
- Builds da solução .NET e frontend aprovados.
- Cobertura: semana atravessando mês/ano, intervalos parciais, 24:00, blocos consecutivos/sobrepostos/fora do funcionamento, cancelamento, período pendente/fechado/manutenção, vínculos de mensalistas, participantes do mês, dados da escola restritos, filtros, falhas de consulta, retorno de foco e invalidação após gravação remota com cache de 30 segundos.
- Conferência visual: desktop 1440 × 1000 e celular 390 × 844; sem rolagem horizontal (largura do documento e da janela: 390). Escape fecha os detalhes e devolve foco à atividade; painel móvel ocupa a tela.
- Homologação local autenticada: interface em localhost:5318 → API em localhost:5319 → banco descartável PostgreSQL. Conta e dados sintéticos. Login, consulta semanal, nova reserva a partir de intervalo livre, persistência e retorno à Agenda verificados pelo navegador. Após salvar a segunda reserva de teste, horas livres mudaram de 92 para 91 e ocupadas de 4 para 5 imediatamente. Nenhum erro de console capturado.

## Revisão e publicação

Prévia de demonstração em localhost:5317, com dados fictícios no navegador. O ambiente conectado ao banco foi encerrado após a homologação; a prévia de demonstração permanece para revisão. Os cenários de preparação não entram no código publicado.

Esta entrega permanece na branch local codex/agenda-confiavel-20261010. Não houve push, PR, integração ou deploy. Após autorização, conferir a base remota novamente, abrir revisão, executar CI e promover a API antes do frontend. Produção exige aprovação do environment e identificação do artefato por commit/digest, conforme AGENTS.md.

Reversão: restaurar as imagens anteriores. Os novos campos são aditivos e não há dados ou esquema a reverter. Validar também o aviso de atualização do aplicativo na homologação hospedada antes da promoção, pois o ciclo real do service worker não foi acionado nesta entrega.
