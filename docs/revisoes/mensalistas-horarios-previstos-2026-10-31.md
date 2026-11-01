# Mensalistas: horários previstos na agenda — 31/10/2026

Implementação preparada para revisão, sem publicação em produção.

## Problema e comportamento

A visão Grupos exibia o acordo semanal, enquanto a Agenda mostrava apenas reservas já geradas. Um grupo ativo sem competência confirmada ficava ausente do calendário.

Semana, Dia e Lista de Mensalistas passam a mostrar os horários desses grupos como **A confirmar**, com borda tracejada. O detalhe informa que o horário ainda não reserva a quadra e oferece **Ver grupo**, na competência correspondente e com retorno à agenda. Não existe uma reserva fictícia nem link para uma reserva inexistente.

As previsões respeitam dia da semana, horário, vigência e situação do grupo. Uma competência já gerada não recebe novas previsões, mesmo quando seus encontros foram cancelados ou remarcados. A competência original de uma remarcação é preservada; reposições com a mesma data e horário não são duplicadas. Pausar ou encerrar um grupo não esconde reservas efetivamente existentes.

Horários previstos não entram em horas ocupadas, encontros confirmados, conflitos ou cálculo de disponibilidade. Os dados oficiais da agenda continuam sendo retornados pelo mesmo serviço. O calendário geral e a agenda de Aulas mantêm seu comportamento. As projeções só aparecem com os dados necessários carregados e permissões de leitura existentes; erros de atualização não são usados para inventar previsões.

Dia e Lista separam a quantidade de encontros da quantidade a confirmar. A situação A confirmar pode ser filtrada. Semana mantém as ocupações reais como contexto e diferencia previsões de Ocupado também no nome acessível.

## Escopo

Somente interface. Sem alterações de API, contratos HTTP, banco, migrations, perfis, configuração Google, cobranças ou confirmação automática de encontros. A consulta e a abertura do detalhe não gravam dados de negócio.

## Validação

- 163 testes afetados aprovados em oito arquivos, incluindo 23 testes da projeção: sete dias da semana, limites de vigência, competências geradas, cancelamentos, remarcações, reposições, intervalos inválidos, fim 24:00 e imutabilidade.
- Testes das três visões, filtros, rótulos, detalhes, competência do link, permissões existentes e preservação de contadores e consultas somente de leitura.
- TypeScript, build Vite/PWA e build da solução .NET aprovados; .NET sem avisos ou erros. Os builds locais foram feitos no checkout compartilhado, que contém alterações de outra tarefa; não constituem um artefato autorizado para publicação desta revisão.
- Revisão independente dos limites da mudança e verificação visual local com dados fictícios. Os registros da prévia ficam em `LongBeach/evidencias/mensalistas-previstos-2026-10-31/` e não devem ser usados como dados de produção.

A publicação exige aprovação específica da versão e um artefato gerado da branch desta correção, sem incorporar alterações da outra tarefa.
