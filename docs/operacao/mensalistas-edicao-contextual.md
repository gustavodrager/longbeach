# Mensalistas — edição na própria tela

A listagem permite corrigir nome, responsável, quadra, dia, horário e valor mensal no próprio cartão. A busca ignora acentos. A ficha mantém edição completa e editores específicos de dados/horário, integrantes e acordo financeiro. Desktop e tablet usam as colunas disponíveis; celular mantém os campos no cartão, seções visíveis e ações de pelo menos 48 px.

## Alcance e histórico

- Alterar o acordo modifica o cadastro atual e a preparação de meses ainda não gerados. Não regenera reservas, cobranças ou integrantes registrados nos meses existentes.
- Cada integrante pode ter nome, telefone, função e situação corrigidos na própria linha. A inativação mantém seu ID e histórico. Definir responsável/suplente substitui a função atual explicitamente; integrantes existentes não são excluídos.
- Encontros atuais/futuros podem ser remarcados ou cancelados na ficha. A gravação usa a versão capturada ao iniciar a edição e o endpoint existente, preserva grupo/mês/valor zero e verifica conflitos no servidor. Encontros passados/concluídos permanecem consultáveis. Não há alteração coletiva de encontros já gerados.
- A cobrança deste mês pode ser criada/editada na ficha, separada do acordo. ID de criação estável durante a edição, versões e regras de cobrança única existentes permanecem. Recebimento manual exige confirmação explícita; alterações de valor, data, modalidade/origem/conta ou situação invalidam a confirmação. Não equivale a confirmação bancária. Recebimentos já pagos continuam preservados, com acesso ao registro financeiro.
- Presença tem ações individuais, trava por integrante durante a gravação, retorno do servidor e erro local. Gravação de um integrante não bloqueia os outros. Presenças futuras/canceladas continuam bloqueadas.
- Uma edição por vez na ficha; salve ou cancele antes de mudar a seção. Alterações não salvas são protegidas ao cancelar, navegar ou recarregar. Falhas preservam o formulário para nova tentativa.

Não há migration, alteração de contrato ou publicação nesta entrega. Permissões, auditoria, concorrência e ciclo de geração mensal usam os serviços existentes.

## Validação local — 20/10/2026

- 440 testes frontend; 419 testes unitários .NET; 5 testes PostgreSQL de Mensalistas, sem skips. Builds frontend e API concluídos.
- Novos cenários cobrem edição na lista, busca sem acentos, preservação do mês e cobrança, mudança de responsável, falha/nova tentativa, confirmação manual, leitura sem permissão de escrita, cliques repetidos, presenças simultâneas e cancelamento com alterações.
- Navegador com banco exclusivamente fictício: nome do grupo, integrante, remarcação de um encontro, criação e correção de cobrança persistidos. Acordo de R$ 400 preservado após ajustar cobrança para R$ 425; nome do integrante do mês preservado após corrigir cadastro atual.
- Conferência visual em desktop 1440 px, tablet 800×1280 e 1280×800, celular 320 e 390 px; sem transbordamento horizontal observado. Emulação não substitui teste no Redmi físico nem teclado virtual real.
- Capturas fora do Git em `outputs/mensalistas-inline/desktop.png` e `outputs/mensalistas-inline/celular.png`, na pasta de trabalho LongBeach.
