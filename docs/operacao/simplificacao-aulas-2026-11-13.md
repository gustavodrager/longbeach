# Simplificação do fluxo de Aulas — 13/11/2026

Implementação na branch `codex/simplificar-aulas-20261113`. Este documento não é recibo de publicação: a versão em produção continua identificada em `estado-desenvolvimento-publicacao.md`.

## Fluxo

- Aulas tem somente Turmas no menu. A lista segue segunda a domingo, horário inicial, horário final e nome como desempate. Todas as turmas não excluídas aparecem, inclusive cadastros antigos pausados ou encerrados.
- Cadastro: Nível (Iniciante, Intermediário, Amador, Profissional), esporte, professor, dia, horário e observações. A quadra única é selecionada automaticamente; zero ou múltiplas quadras bloqueiam um cadastro novo para evitar uma escolha arbitrária.
- Novas turmas começam na data de criação, calculada pela API no fuso da arena. Editar uma turma não altera a data histórica da grade. Nomes antigos permanecem até uma edição explícita.
- Nos detalhes, Incluir aluno pesquisa Clientes e permite cadastrar na hora, conforme as permissões existentes. Uma ficha de aluno já vinculada ao cliente é reutilizada. A inclusão cria a matrícula na turma aberta, com mensalidade opcional para quem pode administrar valores.
- Alunos e matrículas ficam nos detalhes; presenças ficam em uma seção expansível da turma. Retirar um aluno encerra a matrícula, sem apagar registros. Links antigos de matrículas/presenças com `class` encaminham à turma; sem contexto, à lista. Fichas individuais antigas continuam consultáveis para preservar referências.
- Excluir turma mantém o mecanismo de exclusão lógica já publicado: histórico de alunos, matrículas, presenças e cobranças preservado, somente para consulta.

## Compatibilidade e acesso

Não há migration. `capacity` permanece nos documentos antigos como dado de compatibilidade, mas não limita novas matrículas nem a edição de turmas. Não há filtro de situação na lista. Estados antigos de agendamento permanecem intactos: simplificar a tela não reativa horários pausados ou encerrados automaticamente. A matrícula continua proibida em turmas excluídas.

O menu Turmas concentra leitura de alunos, matrículas e presenças; gravar exige a ação `classes.operate`, além das permissões da API. As permissões específicas antigas continuam válidas. Isso não concede acesso financeiro nem administração da equipe. O cadastro de cliente continua sujeito às permissões existentes de Clientes.

## Validação

Build do frontend aprovado; suíte completa com 1.454 testes aprovada. Depois de acrescentar três cenários de cliente na turma, os 98 testes dos dois arquivos afetados passaram. Backend: 68 testes direcionados de validação, data inicial e exclusão; 3 testes de escopo de equipe aprovados. A suíte .NET completa encontrou restrições locais do macOS (Keychain e processos MSBuild); conferir o CI antes de promover qualquer artefato.
