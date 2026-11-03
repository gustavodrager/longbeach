# Cadastro e atividades dos clientes — 03/11/2026

Estado: implementação e conferência local. Produção não alterada.

## Fluxo revisado

1. Cadastro pela equipe: Nome e Telefone → Salvar cliente. E-mail opcional em Mais dados.
2. Cadastro público: Nome e Telefone → Continuar → Google ou usuário e senha, conforme as capacidades confirmadas pelo servidor.
3. A ficha reúne Cadastro e Atividades. Conta de acesso e Opções administrativas ficam recolhidas.
4. Escola, mensalistas, locação e bar reutilizam a mesma pessoa. Tipos não conferem permissões, não definem pagamento nem exigem outra conta.

Definições confirmadas pelo proprietário: todos os integrantes identificados são Mensalistas, podendo também ser Alunos; Avulso inclui quadra e aula avulsa. O [ADR-022](../adr/ADR-022-atividades-dos-clientes.md) registra os critérios, o histórico e o filtro Somente bar.

## Ajustes

- Dados obrigatórios conferidos antes de montar o botão Google; foco no campo inválido e na próxima etapa.
- Telefone formatado pode ser colado sem cortar dígitos; dados preservados ao voltar ou trocar método.
- Método único não provoca uma pergunta de escolha. E-mail opcional fica recolhido e é revelado se inválido.
- Textos genéricos do seletor e da ficha removidos; erros, homônimos, confirmações incertas e consequências de acesso preservados.
- Cliente sem agenda usa o portal e o bar sem aviso de cadastro defeituoso.
- Responsável da comanda é uma escolha explícita e opcional. Nome escolhido e confirmação de responsabilidade continuam visíveis mesmo com a busca recolhida.
- Etiqueta e filtro Avulso consideram vínculos reais. Somente bar exclui registros esportivos, inclusive experimentais e históricos.
- Aula avulsa usa a agenda existente, com cliente e professor explícitos, validação de disponibilidade e separação de experimental, reposição e mensalista.
- Nova cobrança com fonte SingleLesson começa em Escola; lançamentos existentes não são reclassificados.

## Validação

- Interface: 1.154 testes aprovados em 97 arquivos na última execução, sem falhas.
- Servidor: 662 testes unitários aprovados; 47 integrações afetadas aprovadas em PostgreSQL 18.6, sem ignorados. A seleção afetada inclui cadastro, vínculos, dependentes, portal e isolamento do professor.
- Builds da API e da interface/PWA aprovados; TypeScript e `git diff --check` sem erros.
- Revisão independente identificou e corrigiu a divergência do cancelamento com professor inativo no modo demonstração. Demais guardas e efeitos financeiros conferidos.
- Navegador real, prévia local: cadastro por senha → entrada → própria ficha → saída → entrada do gestor → edição da mesma ficha. Edição salva sem duplicar o cliente; sessão fictícia encerrada ao terminar.
- Celular 390 × 844: foco no campo obrigatório, telefone formatado, avanço de etapa, cadastro e edição sem transbordamento; Salvar cliente visível sem rolagem. Computador 1920 × 929: ficha sem transbordamento. Dimensão original restaurada e aba temporária fechada.
- Google coberto pelos testes automatizados de formulário, aplicação e servidor; não foi realizado novo login Google real nem alterado o cadastro OAuth nesta revisão.

Evidências locais em `evidencias/cadastro-cliente-clean-2026-11-03/`, fora do repositório da aplicação: capturas do cadastro público, cadastro da equipe e ficha em celular/computador, logs da interface/build/unitários e recibo da conferência. As saídas de integração e build da API foram observadas pelas ferramentas do agente de revisão; não há arquivo de log bruto dessas duas execuções.

O banco descartável usou PostgreSQL 18.6 em loopback, separado dos outros bancos locais, sem dados ou credenciais reais. A API da prévia manteve workers e provisionamentos desligados; catálogo de perfis e gestor fictício foram preparados por operação local específica, sem iniciar jobs. API, interface e banco temporários foram encerrados após a conferência, preservando os outros ambientes locais.

## Limites de publicação

Esta mudança exige interface e API. Não acrescenta migration, não altera perfis, concessões ou configuração do Google. O cadastro público local de produção permanece fechado conforme a conferência pendente do ADR-021; a prévia habilita esse fluxo somente no banco fictício.

Não houve criação de usuários, convites, cobranças, alteração de credenciais, migração ou publicação em produção nesta revisão.
