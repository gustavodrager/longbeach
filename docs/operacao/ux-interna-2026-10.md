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
- Formulários contextuais só são montados após confirmar a mudança da URL, evitando reinicialização do primeiro campo durante uma transição de navegação.

## Verificação anterior à publicação

- Frontend: 173 testes aprovados e build PWA aprovado.
- API/solução: build Release aprovado sem avisos; 134 testes unitários e 164 testes de integração com PostgreSQL aprovados no CI.
- Chrome com API fictícia local, sem conexão à produção: Agenda, mensalista, turma, aluno, Financeiro, Histórico, Produtos e Estoque nas larguras 360, 390, 768 e 1440. Nenhuma página excedeu a largura da viewport.
- Compras, Caixas, Vendas, Inventário, Equipe, Materiais, Projetos, Manutenção e Comanda também verificados nas quatro larguras, incluindo listas vazias. Total: 68 combinações de página e largura sem transbordamento horizontal.
- Produto: busca → edição → tentativa de cancelamento → manter alterações → salvar → mesma busca e botão de origem focado.
- Aluno: turma → aluno → Cadastro → editar → salvar → Cadastro preservado → retorno à turma original.
- Menu móvel: abertura, Escape e foco restaurado no botão Menu.
- Testes de regressão cobrem permissões, retorno contextual, histórico de busca, zero, paginação e preservação de campos complementares ao editar produto. Os testes existentes de pagamentos, estoque, presença, reservas e conflitos continuam ativos.

## Publicação e rollback

Seguir `deploy-railway-production.md`: snapshot anterior, plano sem drift, CI aprovado, promoção do SHA e conferência de saúde. A versão anterior é `ee43f5cf4e7f414af8e82cf32e69940ad01813f7`, com API `629d709b-2ecd-4796-99d3-55fb1e069d4e` e web `534b4425-adde-41b5-b43a-ba5ef1a170e2`. Nenhuma migration ou alteração de dados é necessária para esta entrega. O smoke em produção deve ser somente leitura.

A revisão `b29dfbd97bc34bc6b22b3b130450bec17f747211` passou no CI `37485544156` e foi publicada: API `80d655a8-831c-4247-aea0-2f8eca1e2cdb`, web `df4a74a3-1e1b-4f7c-9fac-4d19f3fa64f1`. Ambos os health checks passaram e o snapshot final não apresentou drift. A leitura em produção confirmou os produtos, mensalistas e contexto financeiro existentes. O ajuste subsequente de apresentação suprime mensagens de lista vazia durante a leitura inicial ou falha sem dados; o erro/carregamento continua no aviso próprio da página.

Entrega final em 2026-10-06:

- Web fixada em `849b5c35aa293c8add5688eb4d63ed187adc1043`, com CI `37488301806` aprovado nas duas etapas e deployment `0a4d010a-4940-43f0-91d5-656bd99fa74f` concluído com `SUCCESS`.
- API permanece na revisão compatível `b29dfbd97bc34bc6b22b3b130450bec17f747211`. `/health/ready` retornou `Healthy`; `/healthz` da web retornou `ok`.
- `railway config pull` capturou somente a mudança de revisão da web, além da reorganização equivalente das referências GitHub no arquivo gerado. `railway config plan` confirmou ausência de drift. Nenhuma variável, domínio ou serviço auxiliar mudou.
- PWA atualizada no Chrome pela ação “Atualizar agora”. Verificação de produtos paginados, competência de mensalistas, mês padrão de lançamentos e histórico com fonte/cobertura visíveis; menu móvel e retorno de foco também conferidos em produção.
- Cadastro fictício de projeto, em servidor local isolado, confirmou que o primeiro campo permanece preenchido e que salvar fecha o painel e devolve o foco à ação de origem.
- As versões anteriores e seus identificadores acima permanecem disponíveis para rollback. Nenhum registro de produção foi criado ou alterado durante a verificação.
