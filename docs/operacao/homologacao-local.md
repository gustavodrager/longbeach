# Homologação local — decisão vigente

O usuário escolheu manter a aplicação e o banco de homologação no computador. A proposta de provisionar staging no Railway foi substituída; nenhum deploy hospedado foi executado. Google é usado como provedor externo de autenticação, com projeto próprio na conta institucional da arena.

## Prévia preservada

- Web atual: `http://localhost:5321`.
- API atual: `http://localhost:5320`.
- PostgreSQL local: porta 55439, banco `longbeach_profiles_preview`, com dados fictícios das rodadas anteriores.
- Testes automatizados usam banco separado cujo nome contém `test`; não executar a suíte contra o banco de prévia.

Os processos foram reiniciados em 10/10/2026 com a configuração local: API em `Staging`, CORS restrito à web acima, domínio de cookie vazio e escuta somente em loopback. A configuração efetiva está em `.env.homologacao.local`, ignorada pelo Git e com permissão 0600; contém uma chave JWT exclusiva. O banco e as contas fictícias foram preservados. Migrations, seed automático e pagamentos permanecem desativados. Google e cadastro público estão habilitados apenas na API local. A base de prévia agora também contém o cadastro institucional usado no teste real do Google; não exportar ou versionar essa base.

Verificação após a troca: `/health/ready` retornou Healthy; login local com a conta fictícia funcionou e a sessão permaneceu autenticada após recarregar a página. Agenda, solicitações confirmadas e resumo financeiro fictício continuaram disponíveis. Isso valida a sessão local, não uma autenticação real pelo Google.

## Google configurado e verificado localmente

Os modelos `deploy/homologacao/api.env.example` e `web.env.example` contêm a convenção já aplicada ao runtime local. `Staging` é aqui apenas o nome do ambiente da aplicação .NET, sem vínculo com o Railway.

Em futuras execuções, carregar a configuração privada local; não aplicar os modelos com campos vazios. Uma mudança de host/chave exige novo login; preservar dados e contas fictícias. Não misturar localhost na interface com 127.0.0.1 na API. Iniciar os serviços somente em loopback; não usar 0.0.0.0.

Projeto: `longbeach-os-homolog`, criado pelo responsável na conta institucional da arena. Cadastro OAuth: **Long Beach Arena — Homologação**, público externo em modo de teste. Cliente Web: **LongBeachOS — Web local 5321**, com origens `http://localhost` e `http://localhost:5321`, conforme o [guia oficial Google](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid). Nenhuma origem de produção foi adicionada. O fluxo usa Google Identity Services com retorno de ID token; não precisa de segredo OAuth nem de redirect URI.

O Client ID foi aplicado à configuração privada local. `Authentication__Google__Enabled` e `Authentication__Google__ClientRegistrationEnabled` estão ativos. A lista de provisionamento administrativo continua vazia e `ProvisionAllowedEmailsAsOwners` permanece falso. Cookies Secure foram preservados.

Verificações iniciais no Chrome, em 10/10/2026, antes da concessão administrativa descrita abaixo:

- API pronta e opções públicas de login com o Client ID correto.
- Primeiro login Google com consentimento limitado a nome, foto e e-mail; retorno para `/minha-area`.
- Cadastro criado com papel `Student` somente, sem matrícula, grupo ou reserva automática.
- Sessão preservada após recarregar a página.
- Logout retornando para `/login`, inclusive após recarregar.
- Segunda entrada reutilizando o cadastro: uma única conta no banco, vinculada ao Google.
- Tentativa de abrir `/agenda` exibindo **Acesso restrito**.

Na rodada inicial de configuração, não houve alteração de código ou esquema; foram aplicadas configurações e executados testes manuais conectados à API e ao banco locais. As mudanças posteriores de login, a segunda conta real e a nova validação automatizada estão registradas abaixo. Outros navegadores permanecem pendentes. O cadastro do provedor permanece em teste; nenhuma publicação OAuth foi realizada.

## Atualização de login e administração — 10/10/2026

A página `/login` oferece somente Google. Foram removidos o formulário de senha e textos que sugeriam esse caminho; falhas de consulta, Google desativado e falha de carregamento do script têm tratamento sem oferecer senha. A recuperação de acesso aponta para o Google.

Após autenticação real das duas contas expressamente indicadas pelo responsável, a conta institucional recebeu `Administrator` e a conta pessoal do proprietário recebeu `Owner`. Cada conta tem somente seu papel administrativo; o papel `Student` do primeiro cadastro foi removido. As alterações ocorreram exclusivamente em `longbeach_profiles_preview`, em transação, com dois registros `RoleChangeAuthorized`, preservando os vínculos Google e revogando as sessões anteriores. Nenhum outro usuário real recebeu acesso administrativo. O provisionamento automático de proprietários continua desligado e a lista de correspondência por e-mail continua vazia.

Validação: 266 testes web em 31 arquivos passaram; builds da API e da web concluídos. O proprietário voltou a entrar pelo Google e abriu a gestão completa no navegador. Os dois papéis foram confirmados no banco, com auditoria. Esta alteração de página não removeu os endpoints internos de senha usados por compatibilidade e testes. Nenhuma mudança em produção, envio ao repositório ou publicação foi realizada.

## Preparação para PagBank

Por decisão do usuário, PagBank será tratado por último, depois do Google.

Aplicação e banco permanecem locais; chamadas de saída usam exclusivamente o sandbox, após localizar e validar a credencial própria do Long Beach. Pedidos e Recorrência têm configurações separadas. Flags de cobrança seguem desligadas nos modelos.

O endereço localhost não recebe notificações enviadas pelo PagBank. A consulta ativa ao provedor pode validar parte do fluxo, mas não comprova o callback. Para testar notificações, decidir posteriormente sobre um túnel HTTPS temporário restrito aos endpoints necessários. Nenhum túnel, domínio ou acesso público foi criado ou autorizado nesta decisão.

Persistem as pendências registradas no ensaio anterior: repetição Pix, estorno de cartão, assinatura das notificações e recorrência. Não considerar a homologação externa concluída apenas porque o caixa local passou.

## Complemento — vínculos e perfis após o Google

Em 10/10/2026, executados 38 testes de integração de cadastro Google, portal e autorização: todos aprovados, nenhum ignorado. A base exclusiva `longbeach_google_links_test` é separada da prévia; somente identidades e operações fictícias foram criadas nela. O fluxo HTTP utiliza o validador JWT real com emissor Google e chave de assinatura exclusiva de teste, sem chamar o Google ou representar autenticação real de professores/clientes.

Dois cenários integrados novos foram adicionados à suíte:

- Cadastro Google inicialmente sem vínculos, mesmo com aluno de mesmo nome/e-mail; gestão associa aluno, grupo mensalista e reserva. A agenda passa a exibir as aulas matriculadas, a locação avulsa e a reserva do grupo. Nova entrada mantém identidade e vínculos, sem criar cobrança ou conceder funções da equipe.
- Retorno Google de contas já vinculadas como proprietário, administrador, professor e atendente. Gestão acessa os cadastros e o financeiro; professor acessa suas aulas e tem bar/gestão bloqueados; atendente acessa as comandas e tem aulas/gestão bloqueadas.

Também conferidos: cliente não pode criar seus próprios vínculos; outro cliente não vê os compromissos nem consegue solicitar seu cancelamento; vínculo repetido é idempotente e gera uma única auditoria; tentativa de transferir cadastro já vinculado é rejeitada. Os testes existentes complementam conflitos de responsável, disponibilidade, confirmação de solicitações e isolamento por perfil. Builds da API e da web verificados nesta rodada.

Não houve alteração no comportamento da aplicação nesta etapa. Foram ampliados os testes e corrigida a orientação de acesso individual para a página com Google exclusivo. Contas, papéis e dados da prévia foram preservados. A validação automatizada não substitui o aceite da equipe em seus dispositivos nem o teste com suas contas Google reais.

## Próximo passo

A entrada Google local está validada com duas contas reais e os vínculos/perfis estão cobertos pelos testes integrados acima. A rodada de mensalistas e ocupação de eventos por bloqueio foi concluída na prévia; resultados, correções móveis e 709 testes aprovados estão em [Fechamento da rodada local](fechamento-homologacao-local-2026-10-10.md). Não existe módulo específico de eventos; inscrições e torneios continuam fora do escopo implementado.

Restam credenciais sandbox e ensaio externo PagBank, identificação/autorização das contas Google da equipe, testes em aparelhos reais e aceite humano da operação. Antes de usar em produção, configurar um cliente próprio e executar a homologação do domínio real. Envio ao repositório, publicação e exposição de callbacks continuam sujeitos à aprovação específica.
