# Equipe: preparação e operação de acessos

Estado em 04/11/2026: revisão #67 publicada na fonte `b93c7bbe69e8b92321cad3afd70eefb7e1885349`, com API, interface, migration 33 e quatro donos confirmados na configuração protegida. Nenhuma conta foi criada, vinculada ou teve credenciais/perfil alterados pela publicação. Veja o [registro da publicação e seus limites](publicacao-equipe-acessos-2026-11-04.md) e o [manifesto de comprovantes](release-equipe-acessos-2026-11-04.json). O PWA, o login Google e a leitura de Equipe/Tipos foram conferidos com autorização específica; a recarga preservou a sessão. O teste permaneceu em leitura, sem cadastrar pessoas ou alterar acessos e credenciais. Login como Bar/Professor e primeiro acesso não foram exercitados em produção.

## Antes de nova publicação ou mudança de donos

1. Conferir privadamente os identificadores das contas que devem manter a autorização de dono. Não usar busca por nome para conceder acesso. Guardar de um a quatro UserIds confirmados, válidos e distintos na configuração protegida `StaffAccess:OwnerUserIds`, com índices contíguos a partir de zero, sem versionar dados reais. Uma retirada deve preservar exatamente as demais identidades autorizadas, sem substituir a conta por um novo dono.
2. Conferir que todas as contas configuradas existem, têm somente Manager e que pelo menos uma está ativa e com acesso concluído, método de entrada disponível e eventual vínculo de equipe habilitado e compatível. O preflight recusa lista vazia, mais de quatro IDs, índices incompletos, identidade inválida/duplicada/ausente, perfil incompatível ou ausência de dono utilizável. A lista de donos não muda automaticamente o perfil nem o tipo de acesso da conta retirada.
3. Levantar fichas de equipe, contas internas, vínculos de professores, situação e duplicidades de login/telefone. Para cada ficha, registrar a decisão explícita: criar conta, vincular conta existente compatível ou manter cadastro legado sem vínculo até conferência. Nada será associado ou redefinido automaticamente.
4. Revisar os quatro tipos e pessoas afetadas. Dar somente os menus e ações necessários. Bar usa Operations restrito; Professor usa Teacher delimitado às próprias turmas. Gestor não concede administração da equipe a quem não é dono.
5. Executar testes e conferir a compatibilidade dos artefatos e do banco com o conjunto de migrations versionado no preflight e na imagem. Alterar a lista de donos ou o tipo de acesso existente não exige migration. Uma migration futura, quando necessária, deve ser aplicada em job único aprovado, sem seeding, provisionamento ou migrations automáticas de produção.
6. Validar a versão com um dono e contas autorizadas de teste. Conferir Bar, Professor, primeiro acesso, saída, nova entrada e revogação com sessão aberta antes do aceite.

O levantamento deve usar consulta somente leitura e evidência privada; não imprimir senhas, tokens ou dados pessoais em logs ou descrições de revisão. Manter contas, ficha de clientes, matrículas, agenda e histórico existentes. Duplicidades exigem escolha humana, sem fusão ou promoção automática.

## Restringir uma conta antes autorizada como dona ao Bar

1. Operar com outro dono confirmado e utilizável. Conferir privadamente o UUID da conta alvo, a identidade Google existente, a role e o vínculo com a ficha de equipe; não usar somente nome ou e-mail para escolher a conta. Registrar os demais donos que devem permanecer e conferir que o operador continuará autorizado.
2. Se a conta Manager ainda não tem vínculo de equipe, vincular explicitamente a ficha correta à conta existente com o tipo Gestor (`mode=link`, `typeId=gestor`). Isso preserva a identidade e os métodos de entrada. Se já existe vínculo, utilizar essa ficha; não criar outra conta nem redefinir sua senha.
3. Publicar e instalar o preflight versionado pelo processo aprovado antes de reduzir a lista. Conferir o estado real, o commit do guard e a compatibilidade com o artefato por digest e o schema atuais. Não há migration nesta operação.
4. Retirar somente o UUID confirmado da configuração protegida `StaffAccess:OwnerUserIds`, preservando exatamente os demais IDs autorizados e reindexando a lista desde zero. Atualizar a fonte protegida pelo procedimento do ambiente e executar o preflight completo. A API usa `IOptions<StaffAccessOptions>` e um arquivo de configuração montado por bind; uma alteração do arquivo ou recarga da página não comprova atualização da política no processo. Recriar somente o contêiner da API pelo processo aprovado, com o mesmo digest e a configuração conferida, preservando PostgreSQL, proxy e integrações. Confirmar a nova configuração efetiva e o acesso do dono operador antes de continuar.
5. Conferir primeiro os menus e ações reais do tipo Bar no ambiente, que podem diferir dos padrões. Se já atendem ao escopo, na mesma ficha salvar a manutenção do acesso com o tipo Bar (`mode=keep`, `typeId=bar`) e as versões atuais; se exigirem mudança no tipo compartilhado, relatar as pessoas afetadas e obter a decisão antes de alterar. O serviço muda role e tipo juntos e invalida as sessões anteriores. Não deixar a conta com Operations sem escopo de equipe: retirar o UUID da lista de donos, isoladamente, também não conclui a restrição.
6. Validar com sessão renovada a mesma identidade/UUID e vínculo Google, role única Operations, tipo Bar e `canManageStaff=false`; conferir que os demais donos mantêm seus acessos. Verificar os menus de atendimento e caixa, as URLs diretas e consultas GET do catálogo, comandas e próprio caixa. Consultas de módulos externos, produtos/estoque, compras, notas recebidas e equipe devem ser recusadas. Não criar vendas, pagamentos ou caixas fictícios para essa conferência; registrar somente os resultados e as limitações observadas.

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
