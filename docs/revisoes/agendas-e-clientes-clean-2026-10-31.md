# Agenda de mensalistas, agenda de aulas e clientes — 31/10/2026

Entrega preparada para revisão, sem publicação. Reúne os três pedidos desta etapa e preserva a API, o banco, os perfis e a configuração Google.

## Mensalistas e Aulas

- Mensalistas ganha a opção **Agenda**, ao lado de **Grupos**, em `/mensalistas/agenda`. Aulas ganha **Agenda**, ao lado de **Turmas**, em `/escola/agenda`. Os diretórios atuais continuam disponíveis nas rotas originais.
- As duas telas reutilizam `AgendaPage`, `WeeklyAgenda`, as consultas e os detalhes da agenda existente. Não há segunda grade, calendário independente ou nova fonte de disponibilidade. O padrão continua Semana no computador e Dia no celular, com Dia, Semana e Lista selecionáveis.
- Mensalistas mostra as reservas vinculadas aos grupos que realmente existem. Abrir a tela não transforma o acordo semanal ou as datas de uma competência em reservas, não confirma encontros e não cria cobranças. Encontros existentes continuam aparecendo mesmo quando o grupo foi pausado; alterações e cancelamentos seguem os fluxos atuais.
- Aulas mostra as turmas retornadas pelo serviço de agenda e as aulas experimentais já existentes. No contexto escolar, as experimentais aparecem também em Dia e Lista. O filtro de aulas da agenda geral mantém seu comportamento anterior.
- A semana destaca a família selecionada e preserva as demais ocupações como contexto. Dia e Lista focam os encontros/aulas. A conferência completa da quadra fica acessível em **Mais opções → Agenda completa**. Falhas, manutenção, horários desconhecidos e conflitos continuam identificados.
- Não há atalho para criar reserva avulsa nesses dois contextos. **Cadastrar grupo** e **Nova turma** levam aos cadastros existentes. Retornos da ficha e cancelamento/fechamento desses formulários preservam data, período e contexto; salvar turma nova mantém o retorno contextual.
- Filtros de grupos/turmas e da agenda não são misturados. A troca leva somente a referência de mês/data. A alternância fica bloqueada durante a edição rápida de um grupo. O filtro de família é fixo e não conta como filtro adicional nem oferece uma limpeza sem efeito.
- Horário e nome são priorizados nos cartões destacados, com nomes completos acessíveis e no detalhe. Cartões curtos ou com várias quadras podem abreviar o texto na grade do computador; Dia, Lista e o modal permitem a leitura completa.

As permissões existentes continuam válidas: Gestor e Atendente acessam conforme suas concessões. A agenda escolar exige leitura de turmas e da grade; a alternância não é oferecida a quem não pode consultar a grade. Professor e Cliente continuam sem acesso às áreas internas. Participantes históricos dos mensalistas usam a competência original do encontro, inclusive quando houve remarcação. Os dados financeiros continuam condicionados às permissões atuais.

## Clientes

Busca permanece visível; Vínculo, Situação e Telefone ficam em filtros recolhidos com contador. A ação passa a **Novo cliente**. Foram retirados a repetição do nome na ficha e o texto “Ver ficha” em todas as linhas. A situação real e o telefone pendente aparecem juntos, inclusive em cadastros inativos.

Editar e cadastrar mantêm os campos e ações atuais, com menos molduras e sem o título visual genérico de identificação; o agrupamento continua acessível. O aviso de telefone legado fica dentro da edição quando necessário. Permanecem os efeitos do cadastro, os requisitos do telefone, versões e conflitos, recuperação de criação pendente, vínculos e confirmações de Google/unificação. Aluno, Mensalista e Bar continuam sendo vínculos comerciais, sem novas concessões de perfil.

`CustomerLinks`, `CustomerReconciliation`, contratos e chamadas de gravação não foram alterados. Navegar pelas novas agendas não altera registros. Não há mudança de backend, dependências, workflows, migrations ou configuração de produção.

## Validação

- 976 testes da interface aprovados em 89 arquivos. Depois do acabamento dos cartões, 33 testes das agendas focadas passaram novamente em três arquivos.
- Build TypeScript/Vite/PWA aprovado, com 89 entradas no pacote do PWA. Solução .NET compilada com zero avisos e zero erros.
- Prévia local do build real, com dados fictícios, em 390 × 844, 1000 × 1000 e 1440 × 1000. O registro final contém 31 capturas de sete caminhos em diferentes estados e perfis, sem transbordamento horizontal da página.
- Conferidos: Dia/Semana/Lista, alternância de cadastros, fichas e retorno com filtros/período, cancelamento de novos cadastros, bloqueio da alternância na edição rápida, filtros de clientes por teclado, cliente inativo com telefone pendente, edição e novo cadastro no celular, falhas e recuperação de consultas.
- Gestor e Atendente conferidos na prévia; Professor e Cliente tiveram acesso negado às três áreas internas. O Atendente não recebeu links financeiros. As verificações com respostas fictícias não comprovam autorização nem isolamento de dados em produção.
- Falha da consulta escolar não mostra horários livres como confirmados. Recuperação por **Tentar novamente** conferida. Aviso do PWA exibido e atualização aplicada na prévia local.
- Revisão independente encontrou e levou à correção de dois retornos de criação. Nomes acessíveis, agrupamento dos campos, foco e permissões foram revisados. Não foram executadas gravações de negócio no servidor da prévia.

Capturas, fixtures, registros e logs estão em `LongBeach/evidencias/agendas-clientes-clean-2026-10-31/`. O registro `conferencia-visual-final.json` separa estados de sucesso, falha e acesso negado. A aba foi fechada, o tamanho padrão do navegador restaurado e o servidor local encerrado. A publicação desta nova versão depende de autorização específica.
