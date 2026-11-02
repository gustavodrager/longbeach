# Conferência da agenda de Aulas — 02/11/2026

As **nove turmas cadastradas e ativas** foram comparadas com a agenda de produção, usando uma conta Gestor existente. Todas aparecem com nome, dia, horário e vínculo corretos nas visões Semana, Dia e Lista.

## Cadastros e agenda real

Na semana de 02 a 08/11/2026:

| Dia | Turmas esperadas | Turmas exibidas |
|---|---:|---:|
| Segunda-feira | 3 | 3 |
| Terça-feira | 1 | 1 |
| Quarta-feira | 2 | 2 |
| Quinta-feira | 1 | 1 |
| Sexta-feira | 2 | 2 |
| Sábado | 0 | 0 |
| Domingo | 0 | 0 |
| **Total** | **9** | **9** |

Os nove detalhes foram abertos e seus destinos **Ver turma** conferidos contra os identificadores dos respectivos cadastros. As duas turmas chamadas Intermediário, em dias diferentes e sem alunos matriculados, continuam distintas. Uma ficha também foi aberta pelo detalhe, com retorno à mesma seleção da agenda.

A Lista de novembro contém **39 encontros**, distribuídos em **20 na primeira página e 19 na segunda**. A comparação das ocorrências das duas páginas com a grade semanal não encontrou faltas, duplicações nem encontros extras. O período mensal foi aplicado pelo endereço conhecido da agenda; essa conferência não afirma teste manual da edição dos campos de data.

O navegador registrou zero erros no console. O recibo agregado não contém identificadores de pessoas ou credenciais. As capturas são evidências locais privadas e incluem o nome de exibição da conta. Ambos estão em `LongBeach/evidencias/aulas-agenda-2026-11-02/`. A sessão Google foi aberta pelo fluxo normal de uma conta existente; nenhum token ou senha foi extraído.

## Regras conferidas

A agenda de Aulas calcula os encontros diretamente das turmas ativas, respeitando o dia da semana e a data de início. Não exige alunos matriculados nem confirmação mensal. Turmas pausadas, encerradas ou anteriores ao início não geram ocupações naquela data.

Os cadastros e a consulta do servidor são integrais; a Lista apresenta até 20 ocorrências por página. Manutenção, funcionamento pendente e horários importados fora do expediente conservam os blocos das aulas, com a sinalização de disponibilidade e conflito correspondente.

## Testes e compilação

- **16 casos novos de servidor** em `SchoolScheduleTests.cs`: sete dias, várias turmas, nomes repetidos com identificadores distintos, duas quadras, ausência de alunos, início exato e futuro, situações, manutenção, horários fora do expediente, leitura diária/período e proteção dos identificadores. O alvo com os testes preexistentes de `CourtScheduleTests` aprovou **32 testes**, sem falhas ou testes ignorados.
- **15 casos novos de interface** em `SchoolAgendaCoverage.test.tsx`: três visões, sete dias, duas quadras, homônimas, turma sem alunos, vigência, situações, término em 24:00, ficha e retorno. O cenário sintético de **28 ocorrências entre meses**, paginado em **20 + 8**, é independente dos 39 encontros reais de novembro.
- Os **1.035 testes preexistentes da interface** passaram na rodada inicial; o arquivo novo passou na execução direcionada final, após ajustes dos seus seletores e tipos.
- TypeScript e build Vite/PWA aprovados. Solução .NET compilada sem avisos ou erros. A primeira tentativa local de testes .NET não iniciou devido à restrição dos canais do MSBuild; a execução permitida aprovou os 32 casos.
- Revisão independente dos dois arquivos novos, sem achados bloqueantes. Os testes usam dados fictícios e expectativas explícitas, sem reutilizar a lógica de recorrência da aplicação para produzir os resultados esperados.

## Escopo e observação técnica

Esta entrega acrescenta testes e o registro da conferência. O código da aplicação, cadastros, API, banco, perfis e configuração Google permanecem iguais à versão publicada. Não houve publicação, confirmação de encontros, reserva, cobrança ou outra gravação de negócio nesta conferência.

A inspeção também identificou uma limitação lateral: `CourtScheduleQuery` compara a referência da quadra como texto, enquanto a validação do cadastro aceita representações equivalentes de GUID. Formatos alternativos podem exigir correção própria de associação no servidor e na interface. Essa situação não foi encontrada nas nove turmas atuais, cujos horários e destinos foram conferidos individualmente. Esta auditoria não corrige nem declara coberto esse caso.
