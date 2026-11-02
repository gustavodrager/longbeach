# Exclusão de turmas

## Comportamento

O Gestor pode abrir a ficha de uma turma e escolher **Excluir turma**. A confirmação mostra o nome da turma e informa que a remoção da lista e da agenda é definitiva. Cancelar recebe o foco inicial. A confirmação pode ser fechada pelo teclado; durante o envio, novas tentativas e o fechamento ficam bloqueados.

A exclusão é permitida somente para turmas sem alunos e sem registros vinculados. Matrículas de qualquer situação, presenças e referências antigas também impedem a remoção. Nesses casos, o sistema orienta **encerrar a turma**, preservando o histórico. A exclusão não remove alunos, professores, quadras, reservas ou lançamentos.

Atendentes, Professores, Clientes, visitantes e contas com primeiro acesso pendente não podem excluir. A demonstração também não oferece essa operação. As permissões dos quatro perfis continuam as mesmas; a nova ação exige o perfil Gestor no servidor.

## Integridade e atualização

- `DELETE /api/v1/operations/classes/{id}?version=N`, com confirmação `204`.
- Versão ausente ou inválida: `400`; turma ausente: `404`; ficha desatualizada ou histórico vinculado: `409`.
- Exclusão, conferência dos vínculos e auditoria compartilham a transação e a trava já usada pela agenda, matrículas e presenças.
- A auditoria identifica responsável e turma removida sem copiar o conteúdo pessoal da ficha.
- Uma ficha antiga, inclusive sem versão anterior, não pode recriar a turma pela gravação comum após sua exclusão. Essa proteção usa a auditoria existente e não altera o processo explícito de reconciliação de importações.
- A interface mantém a turma até receber a confirmação do servidor. Depois atualiza os dados locais, invalida a agenda e retorna à seleção de Turmas ou Aulas, com a mensagem **Turma excluída.**
- Falhas, perda de conexão e troca de sessão não confirmam a exclusão na interface. Uma resposta de sessão anterior não altera os dados da nova sessão.

## Escopo

Mudança na API e na interface, sem migrations, alteração de perfis ou configuração do Google. Validação exclusivamente com dados fictícios. Nenhuma turma de produção foi excluída e não houve publicação.

## Validação

Validação local concluída com PostgreSQL 17 temporário e isolado:

- **47 testes unitários** aprovados: regras de exclusão e agendas de aulas e quadras.
- **49 testes de integração** aprovados: autorização, PostgreSQL, versão, auditoria, desaparecimento nas agendas diária e por período, histórico de qualquer situação, matrícula concorrente e bloqueio/troca de perfil com o mesmo token. Nenhum teste ignorado.
- **134 testes da interface** aprovados em seis arquivos: confirmação e cancelamento, foco, evento de cancelamento do diálogo, envio único, erros, versão capturada, retorno à lista e à agenda, atualização após confirmação, conexão, demonstração e troca de sessão.
- **57 testes novos**: 15 unitários, 11 de autorização, 12 com PostgreSQL e 19 da interface. Os demais 173 testes já existiam.
- TypeScript, build Vite/PWA e build da solução .NET aprovados; compilação .NET sem avisos ou erros. Revisão independente aprovada. Nenhuma mudança de estilo compartilhado foi necessária.

Na primeira execução, seis verificações de preservação de histórico comparavam o texto JSON original com o JSON normalizado pelo PostgreSQL. A comparação foi corrigida para conferir a estrutura e todos os valores; os 49 testes de integração passaram na repetição. Nenhuma regra da aplicação precisou ser alterada para essa correção.

Comandos, executados dentro de `frontend/`:

```sh
node node_modules/vitest/vitest.mjs run src/pages/ClassDeletionAction.test.tsx src/features/operations/DemoDataProvider.test.tsx src/pages/SchoolAgendaPage.test.tsx src/pages/SchoolAgendaCoverage.test.tsx src/pages/AgendaCreationReturn.test.tsx src/pages/ArenaPages.test.tsx
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
```

No backend, os testes de `ClassDeletion`, `OperationalAuthorizationTests`, `CurrentSessionPostgresTests`, `OperationalPostgresTests`, `SchoolScheduleTests` e `CourtScheduleTests` foram executados com conexão exclusiva à base temporária. O contêiner temporário foi removido ao final; os ambientes locais anteriores foram preservados. A conferência do diálogo usa o ambiente de testes da interface; não foi realizado um ensaio manual em navegador nem uma exclusão no sistema publicado.
