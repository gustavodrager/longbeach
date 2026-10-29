# ADR-019 — Quatro perfis exclusivos

Data: 29/10/2026. Estado: preparação para publicação autorizada nesta conversa. A autorização inclui a experiência de Visitante e sua entrada como Cliente pelo Google; a publicação e a conversão de contas ainda dependem dos gates e comprovantes desta operação. Este documento não antecipa recibo nem afirma execução hospedada.

## Decisão

Cada conta tem exatamente um perfil: **Gestor** (`Manager`), **Professor** (`Teacher`), **Atendente** (`Operations`) ou **Cliente** (`Student`). O nome técnico `Student` permanece para compatibilidade; inclui clientes de aulas, quadras e bar. Esta decisão substitui a união de papéis e a equivalência entre Owner/Administrator/Manager do ADR-005.

**Visitante** é a experiência pública de quem ainda não entrou: consulta somente o conteúdo publicado para acesso anônimo e pode usar Google para criar sua conta de Cliente quando o cadastro público estiver habilitado. Não é um quinto papel persistido. O cadastro cria exclusivamente Student, sem ampliar acesso por nome, domínio de e-mail ou função presumida; entrada de uma conta existente preserva seu único perfil. Os registros pessoais continuam exigindo identidade e vínculos conferidos.

| Perfil | Acesso |
| --- | --- |
| Gestor | Todas as áreas, gestão financeira, estoque, compras, supervisão, importações e vínculos de acesso. |
| Professor | Área pessoal e suas próprias aulas/turmas e chamadas, mediante vínculo atual ao cadastro da equipe. Sem cadastros administrativos, financeiro ou atendimento do bar. |
| Atendente | Atendimento, próprio caixa, clientes, alunos, agenda, mensalistas, materiais e projetos conforme as permissões operacionais. Pode responder solicitações; não administra vínculos de identidade, custos, finanças, compras, supervisão ou ajustes gerenciais. |
| Cliente | Área pessoal, seus compromissos, solicitações, comandas e pagamentos vinculados. Sem acesso à gestão nem aos registros de terceiros. |

As permissões efetivas vêm do catálogo do código para o único perfil atual da conta. Claims antigas e grants persistidos não ampliam o perfil. Contas sem perfil, com múltiplos papéis ou apenas papéis retirados têm acesso operacional negado até conversão explícita. Arrays de papéis nos contratos são preservados, contendo exatamente um item após a ativação; primeiro acesso continua sem permissões operacionais.

O servidor confere o usuário atual a cada autenticação de JWT: conta inativa e perfil inválido são rejeitados; mudança de perfil passa a valer na próxima requisição. Professor e cliente continuam sujeitos aos vínculos e limites por objeto. Alterar rótulos de menu não concede acesso.

## Transição

Não modificar migrations publicadas nem converter contas no startup. A consolidação usa comando pontual, preview somente leitura e aplicação transacional. Um único Owner, Administrator ou Manager vira Manager; um único Teacher, Operations ou Student é preservado. Qualquer outro caso, inclusive combinações, exige mapa explícito por ID e papéis esperados.

Aplicação exige a impressão do inventário retornada pelo preview, mapeamento completo e ao menos um Gestor ativo com primeiro acesso concluído no resultado. Conta pendente não substitui o último Gestor utilizável, mesmo que sua credencial inicial ainda esteja válida. O campo `ActiveManagers` conta somente essas contas aptas à administração. A impressão inclui o estado de primeiro acesso; sua alteração exige nova conferência. Se o inventário ou um papel esperado mudou, toda a operação é recusada antes de gravações. IDs de usuários, credenciais, status, vínculos e histórico permanecem. Sessões de renovação das contas cujo perfil mudou são revogadas. A auditoria registra IDs, papéis e totais, sem nomes, e-mails, senhas ou tokens.

O catálogo persistido recebe os quatro perfis e seus grants exatos. Grants de papéis retirados são removidos; suas definições históricas e as permissões antigas permanecem inertes, sem apagar histórico. Novos provisionamentos e contas de homologação usam somente um dos quatro perfis. Nomes e chaves antigos de bootstrap permanecem compatíveis, mas o acesso administrativo concedido é `Manager`; não promovem contas existentes com outro perfil.

## Validação e promoção

Validar catálogo exclusivo, acesso direto à API/URL, dados de terceiros, conta inativa, JWT anterior, rebaixamento, vínculo de professor revogado, proteção do último Gestor, preview sem escrita, mapa incompleto, inventário desatualizado, conversão completa, auditoria e renovação revogada. Testar em PostgreSQL descartável e com identidades fictícias.

API e frontend devem ser promovidos juntos após a conversão conferida das identidades. O runbook [quatro perfis](../operacao/quatro-perfis.md) define a conferência e a ordem. A publicação foi autorizada nesta conversa; preservar os gates de commit/digest, environment Production, banco e mapa atual antes de executá-la. Autorização não equivale a execução comprovada. Retornar a uma versão que aceita papéis acumulados pode ampliar acesso e exige reavaliação explícita; não desfazer a conversão por SQL ou recriar perfis antigos automaticamente.
