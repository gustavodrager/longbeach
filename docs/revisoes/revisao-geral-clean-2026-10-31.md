# Revisão geral do padrão visual — 31/10/2026

Entrega preparada para revisão, sem publicação. Complementa os lotes anteriores com os pontos que ainda apresentavam introduções genéricas, títulos maiores ou controles diferentes do padrão.

## Cobertura e resultado

O inventário de código reúne 100 rotas folha: 83 da aplicação e 17 do protótipo. Sete layouts e duas delegações completam as 109 declarações JSX de rotas. Foram revisados os componentes de destino, os estados relacionados e os estilos compartilhados; isso não significa que todas as combinações de dados tenham sido abertas no navegador.

- Navegação: seções em uma linha rolável no celular, com a opção atual visível após a leitura dos dados e o redimensionamento da barra. Os links e os filtros por perfil permanecem iguais. Espaço reservado para o contorno do foco, inclusive em Agenda e Estoque.
- Padrão compartilhado: títulos de 32 px no computador e 28 px no celular, sem a linha decorativa do cabeçalho. Botões de fechar com alvo mínimo de 48 px. Removido o rótulo genérico padrão dos cabeçalhos.
- Manutenção: título direto, ação “Nova manutenção”, cartões com prioridade, situação, prazo e responsável; formulário e detalhe com o mesmo padrão dos cadastros.
- Professor: retiradas as apresentações repetidas das turmas. Data, horário, situação, participantes e presença permanecem disponíveis. O aviso de que a lista considera as matrículas válidas na data e o cadastro atual continua visível.
- Cliente: Bar e Perfil com cabeçalhos menores, sem slogans. Ajuda e contato ficam recolhidos. A comanda por QR Code tem um título principal, subtítulos coerentes e ajuda contextual. Saldos, pagamentos em confirmação, impedimentos e recuperação de cobranças continuam visíveis.
- Gestão do bar: Caixa segue o padrão de Estoque. A recuperação de pagamento online recebe os estilos do atendimento. No editor do cardápio, páginas e itens podem ser recolhidos; os resumos preservam preços, visibilidade e pendências. Campos e botões seguem a aparência dos demais formulários. Salvar, publicar e conferir prévia ficam no início; os efeitos sobre os preços continuam explicados junto das ações.
- Protótipo: títulos diretos e menores, sem o slogan da barra lateral. O aviso de dados fictícios e ausência de cobrança real permanece visível.

Entrada, login, primeiro acesso, painéis, cadastros, agenda, matrículas, reservas, financeiro, estoque, relatórios e administração já simplificados foram conferidos e mantidos quando adequados. O cardápio de apresentação preserva a composição própria para leitura à distância. Valores, datas, situações, responsáveis, erros, pendências e consequências de operações continuam disponíveis; os avisos necessários não foram tratados como texto promocional.

Esta mudança não altera regras, cálculos, rotas de acesso, permissões, contratos enviados à API, autenticação ou configuração Google. Backend, banco, dependências e workflows permanecem iguais.

## Validação

- 924 testes da interface aprovados em 85 arquivos. Após o acabamento de CSS, 10 testes do editor/apresentação passaram; após a remoção do slogan do protótipo, 44 testes do protótipo passaram novamente.
- Build TypeScript/Vite/PWA aprovado; 83 entradas no pacote do PWA. Solução .NET compilada com zero avisos e zero erros.
- Prévia local do build real com dados fictícios em 390 × 844 e 1440 × 1000: 50 capturas em 36 caminhos, incluindo os quatro perfis, entrada, login, primeiro acesso, comanda pública e protótipo. Nenhuma captura registrada apresenta transbordamento horizontal da página.
- Menu móvel: link ativo visível mesmo quando a largura muda após a carga dos dados. Tab mantém contorno de 3 px com afastamento de 3 px inteiramente dentro da barra, sem alterar a rolagem vertical da página.
- Enter abre a ajuda da comanda e recolhe a página do editor. Os resumos do editor continuam mostrando preço, visibilidade e pendências. A validação de campos recolhidos abre os ancestrais e conduz o foco ao campo inválido.
- Caixa: aviso de pagamento pendente e confirmação de fechamento desabilitada conferidos. Nenhum fechamento foi confirmado.
- Falha de consulta da manutenção e recuperação por “Tentar novamente” conferidas. As falhas continuam anunciadas; não são apresentadas como uma seleção válida vazia.
- Aviso de atualização do PWA exibido e aplicado na prévia. Pacote final observado: `assets/index-BQZHZkxw.js`.
- Revisões independentes do diff, dos estilos compartilhados e da navegação sem regressão material identificada. Checklist de React aplicado.

As capturas comprovam apresentação local, não os fluxos autenticados de produção. As opções de login são fictícias, com Google desabilitado na prévia. O servidor local recusa gravações de negócio e não acessa API ou banco de produção. Não foram executados pagamentos, estornos, importações, concessões de acesso ou ajustes de estoque. A aba temporária foi fechada, o tamanho padrão do navegador restaurado e o servidor encerrado.

Inventários, capturas, respostas fictícias e logs ficam em `LongBeach/evidencias/revisao-geral-clean-2026-10-31/`. `inventario-rotas.json` identifica a inspeção de código; `conferencia-visual.json` identifica as capturas e seus limites. A publicação desta versão depende de autorização específica.
