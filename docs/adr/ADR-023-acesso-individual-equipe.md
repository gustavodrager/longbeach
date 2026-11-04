# ADR-023 — Conta individual e tipos de acesso da equipe

Data: 04/11/2026. Estado: implementação local aprovada; publicação pendente.

## Decisão

A ficha de Equipe e a conta são mantidas no mesmo fluxo, com uma transação para os dados da pessoa, vínculo e credenciais. Cada pessoa tem no máximo uma conta de equipe e um tipo de acesso: Bar, Professor, Atendente ou Gestor. Os quatro perfis de autenticação existentes são preservados: Manager, Teacher, Operations e Student. Bar é um tipo restrito de Operations, não um novo perfil acumulável.

O tipo define menus e ações do servidor e da interface. A seleção de um menu permite consulta; operações exigem ação específica. Vender, Pedidos, Receber e Meu caixa incluem a operação correspondente, pois não oferecem uma tela separada de consulta. Dependências de seletores retornam somente os campos necessários e não liberam a navegação do outro módulo. Rotas não reconhecidas são recusadas para contas gerenciadas. Alguns endpoints antigos de consulta usam permissões amplas como dependência técnica; clientes devem conferir também os menus e ações de StaffAccess. Essas permissões isoladas não autorizam gravação: o gate do servidor e os controles da interface exigem a ação correspondente.

Professor usa os endpoints delimitados às suas turmas e alunos. Bar usa atendimento, comandas, pedidos, recebimentos e próprio caixa, sem descontos, cortesias, estornos, compras ou ajustes administrativos por padrão. Ações críticas de Gestor são explícitas. Gestor conserva a gestão de negócios; administração da equipe exige a autorização dos donos.

## Donos e contas existentes

`StaffAccess:OwnerUserIds` contém os identificadores estáveis confirmados das contas de Pedro, Victor, Gustavo e LongBeachArena. Nome, telefone, e-mail e função não conferem essa autorização. Configuração vazia fecha a administração da equipe. A implantação exige a conferência das quatro contas e ao menos um dono ativo, com perfil Gestor único e acesso concluído.

A autorização dos donos cobre cadastro de equipe, tipos, bloqueio, reativação, redefinição inicial, vínculo de professores e importações que criem equipe. Os demais Gestores não recebem essas funções. Alterações são conferidas novamente em cada requisição. A última conta de dono utilizável não pode ser bloqueada ou perder o acesso.

Contas atuais permanecem com seus métodos e registros. Não há associação automática por nome, telefone ou contato, alteração em massa de senhas ou concessão automática de tipo. Vincular conta existente exige escolha explícita compatível e ausência de vínculo conflitante. O histórico do cliente e a responsabilidade financeira não são transferidos.

## Credenciais

O login sugerido é o telefone brasileiro normalizado, com alternativa de usuário único. O telefone de contato não muda o login automaticamente. O alias é independente do usuário e dos métodos Google já existentes.

Cada conta nova recebe senha temporária aleatória individual, válida por 24 horas e exibida uma vez. Somente seu hash é persistido. Reenvio da mesma operação não revela nem troca o segredo. Se a resposta se perder, o dono confere a ficha e pode emitir explicitamente novo acesso inicial.

O primeiro acesso exige redefinição da senha local antes de qualquer função interna. A conta inicial não pode contornar essa etapa pelo Google. Trocar credenciais, bloquear, mudar tipo ou reemitir acesso invalida sessões anteriores. Google já vinculado é preservado; a recuperação assistida não desativa esse método silenciosamente.

## Persistência e retorno

A migration aditiva `20261104173051_StaffIndividualAccess` acrescenta alias de telefone, sinal de troca local obrigatória e tabelas de tipos, vínculos e operações. Não altera migrations anteriores nem converte contas reais automaticamente. A auditoria e a idempotência armazenam identificadores e impressões de solicitações, nunca senha temporária ou token.

O runtime recebe somente os privilégios de tabelas necessários; operações de acesso não podem ser alteradas ou excluídas pelo papel de execução. A migration recusa retorno destrutivo se houver vínculo, telefone ou configuração de tipo em uso. Não se deve voltar à API anterior após ativar contas com tipos restritos: a versão antiga conhece apenas os perfis amplos. O retorno exige uma versão compatível com schema 33 e os mesmos limites, ou plano específico previamente conferido.

## Validação

Testes reais com PostgreSQL conferem atomicidade, telefone duplicado, expiração, reenvio sem segredo, concorrência no primeiro acesso, invalidação de JWT, isolamento entre professores, caixa próprio, preservação do Google, contas de donos e transição 32→33. A interface confere menus, ações, erros, retorno de login e primeiro acesso local obrigatório. A publicação é uma operação separada, com artefatos identificados e aprovação específica.
