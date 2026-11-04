# Equipe: preparação e operação de acessos

Estado em 04/11/2026: implementação e prévia local. Nenhuma conta real foi criada ou alterada nesta entrega. A publicação envolve interface, API, configuração e a migration 33 e depende de autorização específica.

## Antes da publicação

1. Conferir privadamente os identificadores das contas de Pedro, Victor, Gustavo e LongBeachArena com os donos. Não usar busca por nome para conceder acesso. Guardar os quatro UserIds confirmados na configuração protegida `StaffAccess:OwnerUserIds`, sem versionar dados reais.
2. Conferir que as quatro contas existem, têm somente Manager e que pelo menos uma está ativa e com acesso concluído. Conferir métodos de entrada e eventuais vínculos com equipe. O preflight recusa configuração incompleta ou ausência de dono utilizável.
3. Levantar fichas de equipe, contas internas, vínculos de professores, situação e duplicidades de login/telefone. Para cada ficha, registrar a decisão explícita: criar conta, vincular conta existente compatível ou manter cadastro legado sem vínculo até conferência. Nada será associado ou redefinido automaticamente.
4. Revisar os quatro tipos e pessoas afetadas. Dar somente os menus e ações necessários. Bar usa Operations restrito; Professor usa Teacher delimitado às próprias turmas. Gestor não concede administração da equipe a quem não é dono.
5. Executar testes e conferir a compatibilidade dos artefatos com as 33 migrations. Aplicar a migration em job único aprovado, sem seeding, provisionamento ou migrations automáticas de produção.
6. Validar a versão com um dono e contas autorizadas de teste. Conferir Bar, Professor, primeiro acesso, saída, nova entrada e revogação com sessão aberta antes do aceite.

O levantamento deve usar consulta somente leitura e evidência privada; não imprimir senhas, tokens ou dados pessoais em logs ou descrições de revisão. Manter contas, ficha de clientes, matrículas, agenda e histórico existentes. Duplicidades exigem escolha humana, sem fusão ou promoção automática.

## Cadastro de uma pessoa

Em **Administração → Equipe → Adicionar pessoa**, o dono informa a ficha e escolhe o tipo de acesso. O telefone da ficha é sugerido como login; a pessoa pode usar um usuário exclusivo. A função descritiva da equipe não concede permissão.

Ao salvar, a ficha e o acesso são confirmados juntos. O aviso **Acesso inicial** permite copiar o login e a senha temporária individual. Entregar somente à pessoa, por canal privado. O segredo vale por 24 horas e não volta a ser exibido depois de fechar. No primeiro acesso, a pessoa define a própria senha e entra novamente.

Para conta existente, escolher **Vincular conta existente**, conferir a identidade, o tipo e os conflitos. Os métodos de entrada existentes são preservados. Um cliente já associado a outra ficha ou professor vinculado a outra pessoa não é transferido silenciosamente.

## Manutenção

- **Tipos de acesso:** revisar menus e operações, conferir o número de pessoas afetadas e confirmar a alteração. As sessões anteriores dessas contas serão encerradas.
- **Bloquear:** encerra as sessões e impede entrada. Reativar devolve apenas o mesmo tipo; não amplia permissões nem redefine a senha automaticamente.
- **Novo acesso inicial:** somente dono, com conferência explícita. Invalida a senha local anterior, encerra sessões e exige nova troca. Não é executado automaticamente por erro de rede.
- **Resposta perdida:** reenviar a mesma solicitação ou conferir a ficha. O servidor reconhece a operação, não cria outra pessoa e não reapresenta a senha. Se necessário, gerar explicitamente novo acesso inicial.
- **Acordo de pagamento:** os dados financeiros continuam protegidos. Manter acesso da equipe sem permissão financeira preserva valores e observações ocultos.

## Retorno e limites

Não promover a API antiga depois de ativar tipos restritos: ela pode interpretar Operations de forma ampla. O preflight rejeita artefatos com outro conjunto de migrations, e o Down recusa remoção de dados de acesso em uso. Preparar correção compatível ou plano específico de retorno antes de qualquer reversão.

Esta entrega não envia WhatsApp ou e-mail, não muda o cadastro OAuth e não provisiona pessoas em massa. A prévia utiliza banco descartável local e dados fictícios. Credenciais locais não devem ser copiadas para produção.
