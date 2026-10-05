# Revisão global de UX/UI — 2026-10-05

## Identidade e experiência

Toda a aplicação usa a assinatura vetorial oficial, Manrope local, areia `#F2E8D8`, preto `#171717` e amarelo `#F5BE3D`. A navegação administrativa está organizada em Arena, Estrutura, Bar e Administração. O atendimento mantém Vender, Comandas, Pedidos e Meu caixa; usuários autorizados podem voltar diretamente à gestão também no celular.

O painel apresenta prioridades atuais, resultados com período e áreas da arena. Cada indicador tem acesso à sua composição. Agenda, Escola, Financeiro, Alunos, Equipe, Materiais, Projetos e Manutenção compartilham filtros legíveis, listas com contagem, fichas e ações. A revisão visual cobriu computador de 1280 px e celular de 390 px, sem substituir um ensaio em aparelho Android real.

No atendimento, a venda explicita Escolher, Conferir e Receber. O catálogo usa Todos quando não existem favoritos. Quando há vários locais, uma escolha válida é necessária antes de mostrar disponibilidade; a preferência e o pedido são preservados por usuário. Comandas existentes mantêm seu próprio local.

## Correções verificadas

- A aprovação manual de cartão pertence ao valor, meio e parcela exibidos. Alterá-los ou atualizar o saldo exige nova confirmação na maquininha.
- Pedidos aguardando aceite não aparecem como Tudo pago; impedem oferecer encerramento prematuro.
- Reservas de hoje e seu detalhe usam a mesma composição, excluindo cancelamentos, bloqueios e aulas.
- Despesas vinculadas à manutenção preservam origem e retorno à ficha.
- Tarefas são editadas por identidade; remover uma tarefa não transfere sua conclusão a outra.
- Leituras operacionais são atualizadas ao voltar à janela, recuperar conexão e a cada 30 segundos enquanto visível. Leituras antigas não sobrescrevem uma escrita posterior; falhas preservam contexto, registros e horário anterior com aviso visível.
- O horário global representa uma leitura completa, sem ser renovado por um salvamento isolado.

## Validação

Em 2026-10-05 passaram 132 testes de frontend e 184 testes .NET (76 unitários e 108 de integração, incluindo PostgreSQL 17 real). Build web/PWA, publicação Release da API e sincronização Capacitor Android/iOS passaram. A revisão visual corrigiu contraste do título no painel e organização das ações no celular.

Não foram gerados APK/IPA assinados nem realizadas sessões com cinco atendentes. A confirmação real de Pix depende da configuração e homologação do provedor. A prioridade global da fila de pedidos ainda usa a paginação por comanda e exige uma consulta própria na API.

## Fonte e promoção

A revisão publicada em 2026-10-04 estava preservada no commit local `50d2234`, mas os serviços oficiais foram substituídos em 2026-10-05 pelo commit GitHub `933161b`, que não continha as novas telas. O código local e o repositório conectado possuem históricos Git independentes. A integração foi preparada sobre a fonte GitHub corrente, preservando Google, staging e a correção `reference-data` de importação.

A promoção utiliza `codex/ux-identidade-global-20261005` em `gustavodrager/longbeach` para os serviços oficiais `api` e `web`. Os demais serviços e domínios permanecem na fonte anterior. Assim, alterações de `main` não substituem uma revisão de produção aprovada. A integração com `main` fica registrada em pull request; futuras promoções devem escolher uma revisão validada e sincronizar o snapshot Railway.

O snapshot foi importado antes da alteração, com plano sem drift. Credenciais, conta Google autorizada, conexão e demais dados pessoais ficam em `preserve()`. A mudança planejada é somente a fonte de `api` e `web`; não é autorizada a remoção de nenhum serviço.

O schema da revisão é o já promovido em 2026-10-04; esta rodada não acrescenta migration. O pre-deploy controlado continua `dotnet LongBeach.Api.dll --migrate-only`. Dados operacionais e lotes importados não são recriados ou aplicados ao promover a interface.

## Retorno

Em falha, retornar aos deployments anteriores de API e web e manter banco e migrations aplicadas. Não executar migrations Down. Preservar a revisão GitHub e só alterar a fonte depois de conferir o plano e a saúde dos serviços. O sistema legado continua fora desta alteração.
