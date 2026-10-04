# Modelo de autenticação web e mobile

## Objetivo e limites

O Long Beach OS mantém sua própria identidade. Usuários, hashes de senha, papéis, permissões, sessões, dispositivos e recuperação de conta pertencem ao banco e aos serviços exclusivos da Long Beach. A web `longbeach.quebranunca.com.br` e a API `api.longbeach.quebranunca.com.br` usam essa identidade própria. Compartilhar o namespace DNS com a Plataforma QuebraNunca não compartilha sessão, cookie de autenticação, login ou tabela. O sistema legado conserva sua autenticação separada durante a transição. Uma federação futura exige novo ADR e protocolo padrão; nunca compartilhamento de senha ou tabela.

## Componentes

- **UserAccount:** identidade de login, status e vínculos com uma ou mais pessoas/arenas conforme necessidade futura.
- **PasswordCredential:** hash produzido por algoritmo atual do ASP.NET Core Identity, com atualização transparente quando parâmetros mudarem.
- **Role e Permission:** autorização administrativa gerenciável, com baseline versionada.
- **RefreshSession:** sessão renovável por dispositivo/navegador; guarda somente hash do token, família, expiração e estado de revogação.
- **DeviceInstallation:** instalação mobile, plataforma, push token protegido e último acesso.
- **SecurityEvent/AuditEvent:** login, falha, rotação, revogação, troca de senha e mudanças de acesso.

## Tokens

### Access token

- JWT assinado por chave exclusiva do ambiente e com rotação documentada.
- Duração inicial: 10 minutos; pode ser calibrada por evidência.
- Claims mínimas: `iss`, `aud`, `sub`, `jti`, `iat`, `nbf`, `exp`, `arena_id`, papéis necessários e versão das permissões.
- Não contém telefone, endereço, salário, dados financeiros ou lista extensa de permissões.
- Validação exige issuer, audience, assinatura, tempo e algoritmo explícitos.

### Refresh token

- Valor opaco com entropia criptográfica; nunca JWT.
- Duração inicial: 30 dias, limitada também por inatividade e política do perfil.
- Armazenado no servidor apenas como hash com identificador de sessão e família.
- Rotacionado a cada uso. Reutilização de token anterior revoga toda a família e gera evento de segurança.
- Revogável por sessão, dispositivo, usuário ou troca de senha.

## Fluxo web

1. A tela envia e-mail/usuário e senha a `POST /api/v1/auth/login` por HTTPS.
2. A API aplica rate limit, valida status e credencial e registra o evento sem guardar senha no log.
3. A resposta entrega o access token no corpo e define `lb_refresh` como cookie `HttpOnly`, `Secure`, `SameSite=Lax`, com `Path=/api/v1/auth`.
4. O frontend mantém o access token somente em memória e o envia como `Authorization: Bearer`.
5. Ao recarregar ou próximo da expiração, chama `POST /api/v1/auth/refresh`; a API rotaciona o token e devolve novo access token.
6. Refresh e logout exigem `Origin` permitido e token anti-CSRF de sessão enviado em header. A API também publica esse token em `lb_csrf`, cookie legível pelo frontend, `Secure`, `SameSite=Lax` e sem valor de autenticação isolado, para permitir renovação após recarregar a página; `lb_refresh` continua `HttpOnly`. O CORS não aceita origem curinga com credenciais.
7. Logout revoga a sessão e expira o cookie. “Sair de todos os dispositivos” revoga todas as famílias do usuário.

Em Production, `lb_csrf` usa `Domain=longbeach.quebranunca.com.br`, o menor domínio comum que permite leitura pela web e emissão por `api.longbeach.quebranunca.com.br`. Não usar `Domain=quebranunca.com.br`, pois isso ampliaria desnecessariamente o cookie a outros subdomínios. O cookie `lb_refresh` permanece restrito ao host da API.

Durante a coexistência, o legado ainda ocupa `longbeach.quebranunca.com.br` e consegue ler o cookie `lb_csrf` com domínio pai. Os hosts também são same-site, portanto `SameSite=Lax` não cria isolamento entre eles. Antes do corte, a API permite no CORS e na validação de `Origin` somente `preview.longbeach.quebranunca.com.br`; a origem oficial fica proibida. No corte, depois de retirar o legado do domínio, CORS muda para a origem oficial, preview é removido e as sessões de teste são revogadas. Antes de um rollback que devolva o domínio ao legado, a origem oficial deve ser removida da API ou a API deve ser desabilitada, além da revogação das sessões standalone.

O frontend não grava access ou refresh token em `localStorage`/`sessionStorage`.

## Fluxo mobile

1. O aplicativo registra uma instalação e envia credenciais, plataforma e identificador local aleatório no login.
2. A API devolve access e refresh token no corpo HTTPS.
3. Access token fica em memória; refresh token fica no Keychain/Keystore por adapter de secure storage.
4. Cada refresh rotaciona o token e atualiza atomicamente o secure storage.
5. O usuário pode revogar a instalação; troca de senha pode revogar todas as sessões conforme política.
6. Push token pertence à instalação e é atualizado separadamente. Revogar push não revoga automaticamente a sessão, e vice-versa.
7. Biometria futura apenas libera o secret local; não substitui autenticação no servidor.

## Endpoints iniciais

| Método e rota | Uso | Autorização |
|---|---|---|
| `POST /api/v1/auth/login` | cria sessão | anônimo, rate limited |
| `POST /api/v1/auth/refresh` | rotaciona sessão | refresh válido + proteção do canal |
| `POST /api/v1/auth/logout` | revoga sessão atual | sessão atual |
| `POST /api/v1/auth/logout-all` | revoga todas as sessões | usuário autenticado + reautenticação quando necessário |
| `GET /api/v1/auth/me` | perfil, arena e permissões efetivas | autenticado |
| `GET /api/v1/auth/sessions` | lista dispositivos/sessões | autenticado |
| `DELETE /api/v1/auth/sessions/{id}` | revoga dispositivo | próprio usuário ou permissão administrativa |
| `POST /api/v1/auth/forgot-password` | inicia recuperação sem revelar existência | anônimo, rate limited |
| `POST /api/v1/auth/reset-password` | confirma token de uso único | anônimo com token válido |

## Papéis baseline

Papéis agrupam permissões, mas endpoints autorizam por policy/permission. Um usuário pode acumular papéis dentro da arena.

| Papel | Escopo inicial |
|---|---|
| `Owner` | configuração, acessos, financeiro, auditoria e todas as operações |
| `Administrator` | administração operacional e usuários, sem ações reservadas ao proprietário |
| `Manager` | alunos, equipe, agenda, cobranças, projetos, estoque e infraestrutura |
| `Teacher` | próprias aulas/turmas, chamada, alunos necessários à aula e ocorrências |
| `Operations` | bar, limpeza, estoque, tarefas e inspeções atribuídas |
| `Student` | somente seus dados, agenda, matrícula, pagamentos e notificações |
| `Viewer` | consultas expressamente concedidas, sem escrita |
| `Auditor` | trilhas e relatórios autorizados, sem alterar operação |

## Permissões iniciais

| Recurso | Owner | Administrator | Manager | Teacher | Operations | Student | Viewer/Auditor |
|---|---:|---:|---:|---:|---:|---:|---:|
| Usuários e papéis | total | gerenciar conforme limite | — | — | — | próprio perfil | auditor lê eventos autorizados |
| Alunos | total | total | total | turmas atribuídas | — | próprio | leitura concedida |
| Agenda/aulas | total | total | total | atribuídas/chamada | tarefas atribuídas | própria | leitura concedida |
| Financeiro | total | configurável | operacional | próprio cálculo quando permitido | — | próprios pagamentos | leitura concedida |
| Funcionários/remuneração | total | configurável | operacional | próprio resumo | próprio resumo | — | leitura concedida |
| Estoque/infraestrutura | total | total | total | registrar uso permitido | operar | — | leitura concedida |
| Auditoria | total | leitura limitada | própria área | próprias ações | próprias ações | próprias ações relevantes | leitura concedida |

O símbolo “—” significa ausência por padrão, não impossibilidade permanente. Toda ampliação deve ser explícita e testada.

## Segurança operacional

- Senha inicial nunca é versionada nem enviada em logs; convite expira e força definição pelo titular.
- Respostas de recuperação são indistinguíveis para contas existentes e inexistentes.
- Rate limit por IP, identificador normalizado e dispositivo, com proteção contra enumeração.
- Mudanças de papel, e-mail, senha, revogação e exportação de dados são auditadas.
- Chaves JWT são diferentes por ambiente; rotação aceita chave anterior somente na janela controlada.
- Clock skew pequeno e relógios monitorados.
- MFA para Owner/Administrator é previsto antes da abertura ampla de Production.
- Contas desativadas perdem access na próxima validação crítica e todas as sessões são revogadas.

## Casos de teste obrigatórios

- login válido, senha inválida e usuário desativado sem enumeração;
- refresh rotativo, duas requisições concorrentes e detecção de reutilização;
- revogação atual, por dispositivo e global;
- access token expirado, issuer/audience/assinatura inválidos;
- CSRF, CORS e cookie seguro no web;
- perda/reinstalação do aplicativo mobile;
- acesso permitido e negado para cada policy crítica;
- alteração de papel refletida sem manter privilégios antigos;
- auditoria completa sem armazenar tokens ou senha.
# Login web com Google

O Long Beach OS usa o Google Identity Services para identificar e-mails permitidos, mas mantém suas próprias contas, papéis, permissões, JWT, refresh token, cookie CSRF, auditoria e banco. A API valida a assinatura do ID token do Google, sua audiência (Client ID próprio do Long Beach), emissor e `email_verified=true`; depois exige correspondência exata, sem diferenciar maiúsculas, com um dos e-mails separados por vírgula ou ponto e vírgula em `Authentication:Google:AllowedEmail`, além de uma conta ativa já cadastrada no PostgreSQL do Long Beach. O bootstrap pontual de contas proprietárias permite criar/elevar os e-mails permitidos com `Authentication:Google:ProvisionAllowedEmailsAsOwners=true`; mantenha essa opção desativada após a execução inicial.

O Client ID OAuth deve ser exclusivo do Long Beach OS, com a origem web de teste e, quando aprovado, a origem oficial do Long Beach autorizadas. Não reutilizar configuração, segredo, usuário, sessão ou banco do Central da Vida. A tela de login Google só substitui a entrada por senha quando `VITE_GOOGLE_CLIENT_ID` estiver configurado; a API habilita o fluxo com `Authentication:Google:Enabled=true` e exige o mesmo Client ID e e-mail permitido. Com Google habilitado, a rota de senha fica desativada. A sessão Long Beach dura até oito horas, como no Central da Vida; a API emite e rotaciona seus próprios tokens e preserva o limite absoluto durante a renovação.

O login web funciona em navegador e PWA. O fluxo de autenticação nativo Capacitor precisa de configuração OAuth nativa própria antes da distribuição em lojas.
