# Agenda — etapa 1, pacote para revisão

## Resultado e escopo

A lista por período passa a incluir as ocorrências de aulas junto de reservas e bloqueios, usando a mesma regra da agenda diária. O cálculo de disponibilidade continua considerando todas as ocupações, mesmo quando um filtro esconde atividades. Horário cadastrado não significa disponibilidade: cadastros ainda não conferidos mostram “Disponibilidade não verificada”.

A interface prioriza data, visualização e nova reserva. Filtros e ações secundárias ficam recolhidos. O aviso de atualização do aplicativo passa a ocupar espaço no layout em vez de cobrir conteúdo.

Implementação isolada na branch `codex/agenda-confiavel-20261010`, baseada em `abb2eb987e44f199323dd71e6bc24d3cdc8dbe7e`. Nenhum registro de produção foi alterado. Não há migration nem mudança de política comercial.

## Critérios de aceite implementados

- Dia e período incluem as mesmas aulas para cada data, respeitando início e situação da turma.
- Reservas, bloqueios e aulas aparecem ordenados por data e horário; paginação considera a lista combinada.
- Filtros de situação/grupo explicam quando ocultam aulas; capacidade não é recalculada a partir da seleção visual.
- Falha na consulta de aulas informa lista parcial e oferece nova tentativa; não é apresentada como agenda vazia.
- Período exige datas válidas, ordenadas e até 366 dias, incluindo os extremos.
- Usuários sem acesso às turmas recebem ocupação sem identificadores ou links privados de aula.
- Quadra fechada, manutenção, cadastro pendente e conflito têm mensagens distintas.
- Celular permite alcançar a primeira atividade sem a antiga sequência de filtros expandidos.

## Verificação

- Interface: 225 testes aprovados em 26 arquivos.
- Regras da aplicação: 185 testes unitários aprovados.
- PostgreSQL 18 temporário: 9 testes de integração aprovados, sem testes ignorados. Incluem consulta diária/período, autorização, mascaramento de identificadores, concorrência de reservas e atomicidade de recorrência.
- Builds da solução .NET e frontend aprovados.
- Navegador: desktop 1440 × 1000 e celular 390 × 844, com dados sintéticos. Lista, busca e limpeza de filtros verificados; nenhuma mensagem de erro capturada no console. No cenário móvel, a primeira atividade começa aproximadamente no pixel 697 e fica inteira visível até o pixel 828. Sem rolagem horizontal.
- Consulta real ao PostgreSQL foi verificada nos testes da API; o navegador usa dados sintéticos locais. O fluxo integrado navegador → API autenticada deve passar por homologação antes de produção.
- A atualização real do service worker não foi disparada; posição do aviso revisada no código. Validar atualização pendente em dispositivo na homologação.

## Decisões da etapa 0 ainda pendentes

1. Fim de semana: somente pacotes/eventos, locação normal por hora ou fechamento com pacote antigo a remover? O sistema não foi reconfigurado.
2. Quinto encontro: acordo por grupo (recomendação), sempre incluído ou sempre adicional? O sistema não foi reconfigurado.

Essas decisões exigem confirmação da gestão. Não confirmar automaticamente a agenda da quadra nem emitir cobranças para resolver divergências de cadastro.

## Próxima entrega e publicação

1. Revisar esta etapa com recepção e gestão, incluindo as decisões acima.
2. Após autorização para envio, abrir revisão da branch no repositório, executar CI e homologar contra API autenticada. A branch de referência atual é `codex/estoque-bar-unico-20261008`; conferir novamente sua versão antes de integrar.
3. Publicação de produção exige aprovação específica e o gate do environment descrito no AGENTS.md. Publicar API compatível antes do frontend que utiliza `schedule-range`. Identificar imagens por commit/digest.
4. Conferir dia/lista com a mesma data, perfis de acesso, erro de rede, datas limítrofes, filtros, atualização do aplicativo e telas móveis.
5. Reversão: restaurar imagem anterior do frontend. A rota nova da API é aditiva e pode permanecer; não há alteração de esquema ou dados a reverter.

## Fora desta etapa

Faturamento mensal, política de quinto encontro, remarcações por chuva, fila de espera, eventos com múltiplas quadras e alterações de recorrência permanecem no backlog. Não foram implementados nem validados como parte desta entrega.
