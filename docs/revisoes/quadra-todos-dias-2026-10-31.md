# Funcionamento diário das quadras — 31/10/2026

A Long Beach abre todos os dias. Esta correção remove o fechamento por dia da semana das decisões da API e da interface. A fonte `66fa521dc2b578fda7182d8d5af81b2f0cb00544` foi publicada com autorização específica em 31/10/2026: API às 08:39:09 e interface às 08:42:19 de Brasília. O [registro da publicação](../operacao/publicacao-quadra-todos-dias-2026-10-31.md) contém os comprovantes e os limites da conferência.

## Comportamento

- Uma quadra antiga com `operatingDays: [1,2,3,4,5]` passa a aceitar reservas, aulas e encontros de mensalistas também no sábado e domingo, dentro do horário cadastrado. Listas antigas vazias ou restritas não determinam disponibilidade.
- A agenda diária e semanal e a consulta do Cliente consideram os sete dias. Datas, dias de aula/encontro, horários, manutenção, conflitos, pendências de conferência e permissões continuam sendo validados.
- Reservas semanais, geração de encontros de mensalistas e importações reutilizam a validação comum, sem fechar a quadra por listas de dias antigas. Atomicidade, repetição segura das operações e auditoria foram preservadas.
- Funcionamento e preços mostra **Todos os dias** e não permite escolher dias de abertura. A seleção do dia da aula ou do encontro de um grupo continua disponível.
- `operatingDays` permanece aceito por compatibilidade, com validação de formato. Novas gravações válidas de quadra guardam os sete dias antes da comparação de repetição do salvamento. A leitura de registros antigos não os reescreve.
- `closedForDay` permanece no contrato da agenda, sempre falso na nova API. A interface ainda respeita esse indicador ao receber respostas de uma API anterior, sem ocultar um fechamento informado pelo servidor.

Não há migration, alteração de perfis, preços, dados pessoais, horários de funcionamento ou configuração Google. Os históricos e vínculos foram preservados.

## Verificação

- 916 testes da interface aprovados em 84 arquivos; build TypeScript/Vite/PWA aprovado.
- 582 testes unitários da API aprovados, sem testes ignorados.
- 29 testes de integração aprovados com PostgreSQL 18 temporário no computador, sem testes ignorados. Incluem a API de operações, agenda, portal, mensalistas, recorrentes e importação de grade.
- Casos de sete dias com cadastros legados restritos/vazios; manutenção, horários, conflitos, meia-noite, agenda pendente, normalização e repetição do salvamento cobertos. O teste do portal confere disponibilidade e confirmação sem expor identidades.
- Solução .NET compilada com zero avisos e zero erros. A restauração local utilizou os pacotes já disponíveis no computador, sem atualização de dependências.
- Prévia em computador e celular com dados fictícios: cadastro antigo com dias úteis mostra Todos os dias, formulário sem seleção de dias e domingo com horários livres. Sem transbordamento horizontal nas telas verificadas. A regra real foi validada nos testes de integração; a prévia de layout usa respostas fictícias.
- Revisão independente do diff sem problemas materiais.

O banco temporário usou imagem oficial já disponível, armazenamento em memória e porta acessível somente pelo próprio computador. Foi removido após os testes, junto com suas credenciais locais. A prévia foi encerrada, a aba temporária fechada e o tamanho padrão restaurado. Produção não foi consultada ou alterada durante esta preparação.

Registros e capturas locais: `LongBeach/evidencias/quadra-todos-dias-2026-10-31/`. A publicação autorizada promoveu API e interface compatíveis, mantendo o banco e o schema existentes. Esta autorização cobriu somente a fonte `66fa521` e não se estende a futuras versões.
