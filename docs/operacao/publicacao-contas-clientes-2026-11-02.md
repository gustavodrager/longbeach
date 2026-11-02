# Publicação — contas individuais de clientes

## Resultado

A revisão [#64](https://github.com/gustavodrager/longbeach/pull/64) foi publicada em 02/11/2026 após a autorização **“publicar”** do proprietário. Foram atualizados API, interface e banco de 31 para 32 migrations. A nova API iniciou às **17h11** e a interface foi publicada às **17h20**, no horário de Brasília.

O sistema permite acesso por usuário e senha ou Google, ativação por convite da gestão, recuperação assistida e autorização explícita de responsável. Os procedimentos estão em [Conta individual de clientes](conta-individual-clientes.md): convite de ativação válido por sete dias, recuperação válida por trinta minutos e vínculo de responsável concedido individualmente pelo Gestor. Nenhuma mensagem é enviada automaticamente.

O **autocadastro público local permanece fechado**. O inventário agregado encontrou 48 cadastros: 46 incompletos e 47 sem conta vinculada. Essas condições podem se sobrepor e exigem conferência; nome, telefone ou e-mail compartilhado não autorizam associação automática. A publicação não converteu pessoas, não criou contas em massa e não concedeu acesso de responsável. As opções existentes do Google foram preservadas.

## Versão e aprovação

- Fonte publicada: `d4ea11a4a84e007be387dc671ac8fbdef6cc3ff4`, branch `codex/conta-cliente-20261102`.
- [CI da revisão](https://github.com/gustavodrager/longbeach/actions/runs/41487953706): quatro verificações de qualidade aprovadas, incluindo PostgreSQL 17 e 18, interface/PWA e transporte WhatsApp.
- [Production](https://github.com/gustavodrager/longbeach/actions/runs/41511359676), tentativa 1: quatro verificações de qualidade e publicação das imagens aprovadas. A aprovação do ambiente ocorreu após a qualidade estar aprovada; revisores e proteções foram mantidos.
- Os artefatos oficiais tiveram proveniência, lista de componentes e bytes conferidos. A promoção utilizou os mesmos artefatos identificados, sem reconstrução local.

As árvores executáveis publicadas são `frontend=f7d8972b12bf8529d850f7bb4001c5c91f591184` e `backend/src=2bb79a36688948145d40b8e135e513a9024ed2d8`. Este registro e o novo manifesto são documentação posterior; não representam outra publicação de código.

## Artefatos publicados

| Componente | Identificação |
|---|---|
| API, índice OCI | `sha256:914f602b2feb0e764fa4ba11696990a0cced8eaf9885db7d830fc1c02953c570` |
| API, configuração da imagem em execução | `sha256:98eb445dce2caa66d57436c61e329bba24a1ef697ed729c23aea7df9488d361a` |
| Interface, índice OCI oficial | `sha256:f2c51f640df0215c7016d0b6ace9b094a08994b033c00392572a214aa2129e1b` |
| Interface, árvore de arquivos | `7d07ae24273491a7820d32e0fd35171cc99f0a882ee6a2353413ff2fdb44e27b` |
| Hosting, versão | `9386ee9c4c395192` |
| Hosting, publicação | `1793650820490000` |
| Migration mais recente | `20261102163528_ClientIndividualAccess` |
| Catálogo das 32 migrations | `e68bb0b2cacc3f30bd53bbda0ce192f7803708bef66e2fdfeb800f29016884a0` |
| Preflight do schema 32 instalado | `b20f28f1c74ab381a5f7330edcf4112be38521f485cac58e304366717e6d356d` |
| Job SQL de 31 para 32 | `d9836a4d1682d00756479e00f525bfc1e076be156b7588a232cadc0790e519ea` |

O Hosting contém 106 arquivos da aplicação e dois arquivos preservados do provedor. Os 199 GETs públicos de conferência passaram, incluindo os hashes dos 106 arquivos, páginas, TLS e recusa de áreas privadas sem autenticação. Essa leitura de bytes foi complementada pela execução no navegador descrita abaixo.

## Banco e preservação

A API e a ponte WhatsApp foram pausadas sob a reserva global da implantação. PostgreSQL e Caddy permaneceram ativos com os mesmos contêineres, imagens, horários de início e redes. O inventário congelado abrangeu os registros das 95 tabelas anteriores, duas sequências, proprietários, ACLs, vínculos de perfis e configuração do transporte.

Foi obtido um dump real, mantido somente no armazenamento local privado. Seu SHA256 é `bbc9b27cb09ba51aac8e4033b0ce1791c79a05e9f46f963d32c3d8d73bcf0c7a`. A restauração foi ensaiada em PostgreSQL 18 local, sem rede ou portas publicadas, sem API, workers ou seed. Papéis substitutos sem login permitiram restaurar proprietários e ACLs sem copiar senhas de banco. Dados, duas sequências e permissões foram comparados; diferenças locais deliberadas de papéis e representação de constraints constam no recibo privado. O contêiner temporário foi removido.

O mesmo job SQL ensaiado aplicou o delta EF de 31 para 32 em uma transação com `SET LOCAL ROLE longbeach_migrator`, trava e limites de tempo, exigindo o catálogo 31 exato. O ensaio também comprovou a recusa de repetição após o schema 32. O preflight correspondente foi instalado com os escritores pausados antes da migration, impedindo reinício incompatível durante a transição. Não foram utilizadas credenciais de migrator no processo normal da API.

Antes da retomada, foram conferidos os hashes dos dados e metadados anteriores, descontando somente as três novas colunas previstas e suas restrições, as duas novas tabelas e o registro da nova migration. As credenciais começaram na versão zero; os novos desafios e vínculos de responsável estavam vazios. O runtime recebeu apenas leitura, inserção e atualização nas tabelas novas; exclusão e outros privilégios foram recusados, assim como qualquer acesso de `PUBLIC` e dos papéis WhatsApp. Essa ACL também passou nas observações posteriores.

A nova API iniciou depois do preflight e teve a saúde confirmada antes da retomada da ponte. A ponte foi retomada no mesmo contêiner, imagem e redes, com novo horário de início esperado. A configuração do Google, perfis, parâmetros de pagamento, workers e automação foi preservada. As alterações de arquivos de runtime limitaram-se a `API_IMAGE` e ao preflight compatível com o schema 32. Não houve seed, CLI de perfis ou retorno automático por `Down`.

As comparações de registros ocorreram com os escritores pausados. Após a retomada, sessões, auditoria e tarefas normais podem produzir movimentações legítimas; este registro não afirma que o banco permaneceu sem escritas durante o uso.

## Conferência no sistema publicado

- API saudável, leitura de prontidão com `200` e nove rotas privadas recusando requisições sem autenticação com `401`, sem criar cookies. Schema 32, ACL, imagens, parâmetros de login e configuração foram novamente conferidos após a interface.
- O aviso do PWA foi exibido e **Atualizar agora** carregou `/assets/index-BUu4IjM8.js`. A sessão existente permaneceu disponível e a área de métodos de acesso mostrou o Google vinculado.
- Sair e entrar normalmente com o Google de um Gestor existente funcionou. O formulário de usuário e senha foi exibido, sem enviar credenciais locais reais. Links de ativação e recuperação sem segredo foram recusados.
- Nenhum cadastro, convite, recuperação ou autorização de responsável real foi criado para teste. Login por senha local e consumo de links válidos foram exercitados nos testes isolados, sem apresentar esses ensaios como autenticação real de produção.

A primeira captura somente de leitura do Hosting recusou a diferença entre a expectativa fixa de 104 e o metadado observado de 105 arquivos da versão anterior. A contagem esperada foi corrigida para 105 após nova leitura do Hosting e comparação com o recibo anterior, mantendo a conferência do mapa e dos hashes. As tentativas originais foram preservadas e os 95 testes dos helpers corrigidos passaram. A primeira observação da API após a retomada da ponte ocorreu enquanto sua saúde ainda estava em inicialização; o diagnóstico e a nova verificação somente de leitura passaram. Nenhuma migration, promoção ou retomada foi repetida por essas recusas.

## Encerramento

A auditoria independente final aprovou 350 verificações dos comprovantes, preservação e encerramento. A reserva global foi arquivada e encerrada após a prova da interface. A observação final confirmou API saudável, schema 32, ACL e ausência da reserva. A política temporária `65267108` foi removida; as políticas anteriores, revisores e demais proteções foram conferidos às 17h27 de Brasília.

O [manifesto desta publicação](release-contas-clientes-2026-11-02.json) contém referências e hashes dos comprovantes privados em `evidencias/conta-cliente-2026-11-02/publicacao-d4ea11a/`. Dumps, segredos, links de convite, senhas e dados pessoais não integram este registro. Os históricos e os dois arquivos locais de outras operações foram preservados.

Depois de utilizar contas, desafios, responsáveis ou versões de credenciais novos, não executar `Down` nem restaurar uma cópia antiga sobre dados ativos. Uma correção exige avaliação de compatibilidade e procedimento autorizado. A habilitação do autocadastro local continua dependendo da conferência da gestão e de autorização específica.
