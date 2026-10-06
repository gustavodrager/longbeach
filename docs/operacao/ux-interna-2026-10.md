# Reorganização das páginas internas — outubro de 2026

As páginas de gestão usam sete áreas principais, navegação contextual e as mesmas URLs anteriores. Atendimento mantém Vender, Comandas, Pedidos e Meu caixa. Os destinos são filtrados por permissão; o acesso por URL continua protegido pelos guards existentes.

## Convenções

- `secao` seleciona uma seção da ficha; a competência de mensalistas continua em `month`.
- `acao` e `registro` abrem edição contextual. Os caminhos `/novo` existentes continuam válidos.
- Busca usa substituição do histórico. Filtros e paginação permanecem na URL. Estado de retorno acompanha mudanças de seção e edição; as posições de listas são restauradas durante a sessão.
- Edição usa diálogo modal: painel lateral no computador, tela inteira no celular, foco contido, Escape, Salvar/Cancelar e proteção de alterações ao navegar ou recarregar.
- Listas extensas renderizam 20 registros por página. Os endpoints existentes continuam responsáveis pelos dados; não foi introduzida paginação de API nem mudança de contratos financeiros.
- Zero é um valor válido. Competência, origem, cobertura e atualização não são substituídos por valores fictícios.
- Produtos esperam as categorias e fornecedores antes de montar o editor, preservando valores de seletores assíncronos. DTO, versão e identificadores de operações permanecem inalterados.

## Verificação anterior à publicação

- Frontend: 173 testes aprovados e build PWA aprovado.
- API/solução: build Release aprovado sem avisos; 134 testes unitários aprovados. A integração com PostgreSQL é validada pelo CI antes da promoção.
- Chrome com API fictícia local, sem conexão à produção: Agenda, mensalista, turma, aluno, Financeiro, Histórico, Produtos e Estoque nas larguras 360, 390, 768 e 1440. Nenhuma página excedeu a largura da viewport.
- Compras, Caixas, Vendas, Inventário, Equipe, Materiais, Projetos, Manutenção e Comanda verificados em 390 px, incluindo listas vazias.
- Produto: busca → edição → tentativa de cancelamento → manter alterações → salvar → mesma busca e botão de origem focado.
- Aluno: turma → aluno → Cadastro → editar → salvar → Cadastro preservado → retorno à turma original.
- Menu móvel: abertura, Escape e foco restaurado no botão Menu.
- Testes de regressão cobrem permissões, retorno contextual, histórico de busca, zero, paginação e preservação de campos complementares ao editar produto. Os testes existentes de pagamentos, estoque, presença, reservas e conflitos continuam ativos.

## Publicação e rollback

Seguir `deploy-railway-production.md`: snapshot anterior, plano sem drift, CI aprovado, promoção do SHA e conferência de saúde. A versão anterior é `ee43f5cf4e7f414af8e82cf32e69940ad01813f7`, com API `629d709b-2ecd-4796-99d3-55fb1e069d4e` e web `534b4425-adde-41b5-b43a-ba5ef1a170e2`. Nenhuma migration ou alteração de dados é necessária para esta entrega. O smoke em produção deve ser somente leitura.
