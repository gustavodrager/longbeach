# Importação da grade de aulas

O pacote operacional cria professores, turmas e matrículas a partir de uma grade atual explicitamente confirmada pela gestão. A planilha original continua preservada, mesmo quando o mês nela escrito é anterior à confirmação. Valores pagos em controles antigos não são transformados em mensalidades atuais nem em acordos com professores.

## Preparação e reconciliação

1. Ler a grade e guardar hash SHA-256, aba, linhas e nomes originais fora do Git.
2. Conciliar os nomes com os alunos existentes. Registrar os aliases usados no pacote; nomes ambíguos exigem conferência. O importador não cria nem renomeia alunos.
3. Resolver horários repetidos e capacidade com a gestão. Preservar a informação original e a correção em cada linha de staging.
4. Preparar registros `reference-data` com `data.schema = longbeach.class-grade-operations.v1`, `data.kind` (`team`, `classes` ou `enrollments`) e `data.body`. IDs estáveis são derivados da operação para que o reenvio não crie duplicatas. O pacote mantém `sourceRows` e `userConfirmation`.
5. Enviar em Importações. Usar **Conferir grade de aulas** e inspecionar os vínculos, horários e vagas antes de aplicar. O lote anterior de leitura da planilha permanece como fonte de conferência, sem gerar lançamentos duplicados.

## Aplicação

Somente Owner acessa `/api/v1/imports/{id}/class-grade` e `/apply`. A prévia contém os cadastros e as divergências. A confirmação identifica a prévia e os cadastros operacionais consultados. Mudanças entre conferir e aplicar exigem nova conferência.

A aplicação usa uma transação e o mesmo advisory lock das alterações manuais da arena. Valida quadra, horário de funcionamento, sobreposição, professor, aluno, capacidade, matrícula repetida e início da grade antes de persistir. Erros invalidam o lote inteiro. Cada cadastro recebe `importSource` com lote, hash e posição de origem. O lote e seus registros passam a Applied, e o evento `ClassGradeApplied` registra somente contagens na auditoria. Repetir um lote aplicado não altera cadastros que tenham sido editados depois. Um lote diferente com IDs existentes é bloqueado, sem sobrescrever dados.

Não são criados lançamentos financeiros, reservas de mensalistas nem presenças. `payAmount` e `monthlyAmount` da matrícula aceitam `null` explícito para **A combinar**; zero continua sendo um valor distinto. A ausência da propriedade e valores inválidos são rejeitados. A edição por pessoas sem permissão financeira preserva inclusive o estado desconhecido.

`classes.startDate` opcional limita a grade às datas a partir da confirmação. Turmas antigas sem a propriedade mantêm o comportamento anterior. A grade atual no dashboard conta turmas já iniciadas, matrículas ativas já iniciadas, capacidade e alunos únicos; histórico financeiro mantém sua referência original. A importação de aulas não confirma a agenda completa da quadra: mensalistas e bloqueios ainda precisam ser conferidos antes de mostrar horas livres como definitivas.

## Validação e reversão

Testes cobrem autorização Owner, lote inválido sem efeito parcial, concorrência/reenvio, origem persistida, preservação de edições, valores desconhecidos, data de início e indicadores sem duplicar alunos. Builds API e PWA são obrigatórios. Nenhuma migration é necessária: os novos campos pertencem aos documentos operacionais versionados.

Após importar valores desconhecidos e datas de início, manter API e web em versões que suportam esta funcionalidade. Preferir correção adiante a rollback anterior ao importador. Para desfazer uma grade aplicada, encerrar suas matrículas e pausar suas turmas pelos cadastros, preservando a auditoria e a origem. Não apagar históricos ou reaplicar o arquivo como mecanismo de reversão.
