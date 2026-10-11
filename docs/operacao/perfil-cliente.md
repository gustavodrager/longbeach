# Área do cliente — operação e validação

## Entrega

- `/minha-area`: próximo compromisso, solicitações e últimas respostas, acesso ao bar e pagamentos relevantes.
- `/minha-area/agenda`: aulas e reservas, detalhes, últimas visitas e avaliação após a atividade.
- `/minha-area/solicitar`: aula experimental, quadra, remarcação e cancelamento com confirmação da equipe.
- `/minha-area/bar`: abre comanda vinculada; visitantes continuam usando o QR sem cadastro obrigatório.
- `/minha-area/pagamentos`: contas separadas por A pagar, Em confirmação e Histórico; Pix copiável e consulta de comprovantes.
- `/minha-area/perfil`: nome de preferência, telefone, vínculos e lembretes internos. A recuperação de acesso continua assistida pela equipe, além dos métodos de autenticação existentes.
- `/minha-area/ajuda`: solicitação com resposta acompanhável. `ClientPortal__HelpUrl` opcional configura um canal externo HTTPS; sem essa configuração, permanece a orientação ao balcão.
- `/solicitacoes-clientes`: fila da equipe, respostas e vinculação de cadastros.

A comanda exibe Destaques, Disponível/Esgotado hoje e saldo com valores em confirmação separados. O Pix permanece acessível depois de sair e voltar do banco. Após encerramento, o QR ainda válido permite consulta e impressão; não permite compras nem novos pagamentos.

## Preparação da equipe

1. Disponibilizar contas individuais pelo fluxo de acesso existente. Um cliente pode usar a mesma conta para aulas, quadra e bar.
2. Conferir a identidade e vincular usuário ao aluno, reserva ou grupo em Solicitações de clientes. Vínculos financeiros existentes são reaproveitados. Não vincular por semelhança de nome.
3. Para responder solicitações, conceder `students:write` e `projects:write` (ou Owner). Para criar vínculos, exigir também `users:manage`. O cliente não recebe essas permissões.
4. Conferir horários de funcionamento, quadras disponíveis, grade, professores e confirmação da agenda antes de confirmar pedidos. Meia-noite é digitada como `00:00` no término e armazenada como `24:00` do dia escolhido.
5. Na confirmação, informar valor acordado inclusive zero. Se mudar data/horário, enviar alternativa; o cliente aceita e a disponibilidade é conferida novamente. Uma proposta não bloqueia a quadra.
6. Em cancelamentos de aula, a alteração vale somente para aquela ocorrência do cliente. Conferir também a operação da presença; a matrícula e a turma continuam ativas.
7. Continuar gerando/vinculando cobranças pelo financeiro existente. A confirmação da solicitação, por si só, não cria uma cobrança. Remarcação preserva o valor; mensalista fica no mesmo mês.
8. Corrigir identidade/vínculos incorretos pelo processo administrativo auditado; a interface não troca automaticamente o responsável de um cadastro já vinculado.

## Falhas e acompanhamento

- Em conexão interrompida, usar Verificar envio. O rascunho desta solicitação fica na sessão do navegador e reutiliza a mesma operação. Uma resposta de validação permite corrigir os campos.
- Se outra pessoa alterar a solicitação, atualizar a página antes de responder. Se o compromisso original mudar, recusar o pedido antigo e orientar nova solicitação.
- Horário ocupado após proposta: o aceite falha sem criar reserva; a equipe pode oferecer outra alternativa.
- Dados pessoais e agenda exigem login; QR não substitui a conta individual. Revogação e expiração de QR continuam funcionando após encerramento.
- Avisos de hoje respeitam a preferência no perfil. WhatsApp, e-mail, SMS e notificações externas não fazem parte desta entrega. As avaliações ficam registradas; ainda não há painel agregado de avaliações.

## Verificação técnica

Execução local em 2026-10-06: 152 testes unitários e 206 de integração do servidor, 197 testes da interface, compilação TypeScript e build de produção aprovados. PostgreSQL 17 descartável, dados fictícios e nenhuma operação de produção. A suíte cobre isolamento entre usuários, bloqueio administrativo para clientes, vínculos explícitos, reenvio idempotente, confirmação concorrente, conflito de quadra, aceite de alternativas, cancelamento individual, auditoria sem conteúdo pessoal, fechamento da comanda, Pix e navegação pessoal.

Comandos reproduzíveis, com dependências restauradas e banco exclusivo de testes:

```sh
dotnet test LongBeach.sln --no-restore --disable-build-servers -m:1
cd app
node node_modules/typescript/bin/tsc -b
node node_modules/vitest/vitest.mjs run
node node_modules/vite/bin/vite.js build
```

Definir `LONG_BEACH_TEST_DATABASE_URL` para o banco descartável antes dos testes: sem essa variável, testes PostgreSQL podem ser ignorados. Nunca usar conexão de produção. Os testes do checkout usam provedores simulados; a homologação real de Pix/cartão/assinatura permanece no runbook de pagamentos.

A inspeção visual pelo navegador foi bloqueada porque a verificação de segurança estava indisponível, inclusive na prévia local. Testes de componentes e builds não comprovam layout, WCAG ou experiência real. Não houve teste com clientes nem publicação.

## Aceite com clientes antes da ampliação

Recrutar alunos, responsáveis de grupos e visitantes, incluindo pessoas com pouca familiaridade com aplicativos. Usar dados de teste e pagamentos de homologação. Rodar no celular, em largura pequena, com texto ampliado, teclado e leitor de tela. Conferir foco visível, ordem de leitura, contraste, área dos botões e informação independente de cores.

| Tarefa | Resultado esperado |
|---|---|
| Encontrar próximo compromisso | Identifica data, horário, quadra e situação sem ajuda |
| Solicitar quadra | Entende que a vaga depende da confirmação |
| Ler alteração da equipe | Encontra resposta e só aceita alternativa conscientemente |
| Pedir no bar | Distingue enviado, confirmado, preparado/entregue e recusado |
| Pagar e voltar do banco | Retoma o mesmo pagamento e não cria cobrança duplicada |
| Consultar depois de encerrar | Encontra comprovante; entende validade do QR e histórico pessoal |
| Recuperar conexão interrompida | Recupera a mesma solicitação/pedido sem perder intenção |
| Tentar horário indisponível | Entende o impedimento e consegue pedir alternativa |
| Conferir duas contas distintas | Cada cliente vê somente seus próprios dados |

Registrar por participante/tarefa: conclusão sem ajuda, conclusão com ajuda, tempo, abandono, erro e comentário espontâneo. Não registrar dados bancários. A primeira rodada estabelece a referência; comparar a segunda com a mesma tarefa e perfis semelhantes. Não existem resultados de usabilidade medidos nesta entrega.

## Publicação e rollback

Esta alteração depende da entrega de pagamentos (PR #15 / ADR-006). Aplicar as migrations dessa base pelo job único existente; o portal não acrescenta migration. Publicar API e frontend compatíveis, validar em homologação e obter aprovação do environment antes de promover produção. Reverter ambos os artefatos para o commit anterior preserva dados e permite retomada, sem apagar registros ou desfazer pagamentos.
