# Menus e telas iniciais simplificados — 30/10/2026

Esta revisão aplica o padrão de entrada e login aos menus e às telas iniciais de Gestor, Professor, Atendente e Cliente. A fonte `6cf09d4` foi publicada após aprovação específica em 30/10/2026 às 16:45:20 de Brasília. O [registro da publicação](../operacao/publicacao-menus-inicio-clean-2026-10-30.md) contém os resultados e comprovantes da operação.

## Resultado

- Gestor: Visão geral sem introdução ou numeração decorativa. Operação de hoje e pendências continuam abertas; extratos históricos ficam em Consultas. Valores, datas das fontes e ressalvas financeiras foram preservados.
- Menus de trabalho: logo sem legenda; retirada do atalho de Bar duplicado; acessos pessoais reunidos em Conta. No celular, Menu abre as áreas e a conta; o atendimento mantém os quatro atalhos de operação e Mais para os acessos secundários autorizados.
- Professor: Aulas de hoje, data, horários, lotação e situação; navegação Hoje, Turmas e Presenças. Conta reúne Minha área e Sair.
- Atendente: Vender abre em destino, identificação opcional e produtos, sem etapas ou instruções duplicadas. A identificação fica compacta, com o aviso sobre cadastro e acesso no formulário de novo cliente. Rascunhos, erros, confirmação, preços e estoque permanecem acessíveis.
- Cliente: Minha área mostra próximo compromisso, horário, quadra, professor, situação, solicitações, respostas, pagamentos e comanda. Menu de cinco destinos, no cabeçalho no computador e inferior no celular. Aviso de conta sem vínculos mantém a consequência sobre matrícula e reserva.

Rotas, filtros, permissões, autenticação, contratos da API, banco e configuração Google não foram alterados. A próxima etapa de simplificação dos cadastros e demais fluxos fica para revisão própria.

## Verificação

- 855 testes da interface aprovados em 82 arquivos. Incluem autorização por perfil, atalhos, conta, recuperação, dados próprios e confirmação de atendimento.
- Build TypeScript/Vite/PWA aprovado; build da solução .NET aprovado, sem avisos ou erros.
- Conferência no navegador em 1280 × 720 e 390 × 844, com dados fictícios fornecidos por servidor HTTP local e build real da aplicação. Os quatro perfis registraram largura de conteúdo de 390 px no celular, sem transbordamento horizontal.
- Menu por Enter, fechamento por Escape e retorno de foco conferidos. Conta do Gestor aberta em 1280 × 600 manteve os acessos pessoais dentro da janela e rolagem independente da navegação.
- Falhas de consulta visíveis nos quatro perfis; recuperação pelo botão da inicial; Professor sem aulas e sem vínculo; Cliente sem vínculo. Não houve consulta ou alteração de pessoas reais.
- Rascunho do Atendente conferido no navegador: Água por R$ 5,00, resumo e aviso de que registrar não confirma pagamento. Produto retirado pelo próprio controle; nenhum pedido ou pagamento enviado.
- Aviso Atualização disponível e ação Atualizar agora carregaram o build seguinte na prévia local.

Capturas e registros locais: `LongBeach/evidencias/menus-inicio-clean-2026-10-30/`. O servidor de prévia serve `frontend/dist`, sem cópia de código-fonte e sem conexão com produção; operações de negócio são recusadas.
