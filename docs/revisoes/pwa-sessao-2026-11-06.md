# Retomada da sessão após atualizar o aplicativo

A atualização do PWA pode recarregar várias abas abertas. Cada uma retomava a sessão por uma renovação independente, sem coordenação entre abas; o CSRF também podia continuar em memória após outra aba rotacionar o cookie. Além disso, a inicialização tratava indisponibilidade da renovação como ausência de sessão e apagava o usuário quando a consulta adicional de identidade falhava temporariamente.

## Comportamento

- Renovações e operações de autenticação que alteram cookies usam o mesmo lock entre abas, quando o navegador oferece [Web Locks](https://w3c.github.io/web-locks/). O CSRF é consultado novamente depois de adquirir esse lock. Não se armazenam credenciais ou tokens de acesso em localStorage/sessionStorage.
- Entrar, sair ou alterar credenciais invalida respostas anteriores de restauração. O token atual continua disponível para a requisição autenticada de troca de senha, até sua conclusão.
- Falha temporária ao retomar o acesso mantém a URL e apresenta somente uma mensagem curta e **Tentar novamente**, inclusive no primeiro acesso. As telas públicas de login e cadastro continuam independentes dessa recuperação.
- Uma falha temporária em `/auth/me` não elimina o usuário que o próprio servidor acabou de validar na resposta de renovação. Negações definitivas continuam encerrando a sessão; bloqueios, credenciais revogadas e permissões continuam sendo decididos pelo servidor.
- A restauração só libera a rota quando termina. Parâmetros e âncora da URL permanecem no lugar. Não há atraso arbitrário para esconder o redirecionamento, extensão da validade das sessões ou alteração do service worker para ignorar autenticação.
- O recarregamento do PWA aguarda as operações de sessão em andamento. A trava termina ao sair da página e possui escape de dois segundos após a aquisição caso a navegação seja cancelada ou falhe. **Atualizar agora** permite tentar novamente a recarga mesmo se o novo worker já foi ativado.

Navegadores sem Web Locks mantêm a deduplicação dentro da aba e a recuperação de erros temporários; não se desativa a proteção contra reutilização de refresh no servidor.

## Validação

- **1.435 testes da interface em 117 arquivos**, incluindo 47 regressões novas de sessão, autenticação e atualização, aprovados com `pnpm test --maxWorkers=2`.
- Build TypeScript/Vite/PWA aprovado. Build Release da solução .NET aprovado, sem avisos ou erros. Não houve alteração de código do backend, migration ou configuração de autenticação.
- Os testes cobrem cookies rotacionados por outra aba, fila entre abas, login/logout durante renovação, StrictMode, desmontagem, respostas antigas, primeiro acesso, recuperação na mesma URL e 401/403 definitivos.
- Ensaio no Chrome com artefatos compilados da aplicação canônica e API exclusivamente fictícia em loopback. Três abas mantiveram a tela **Segurança**, o caminho, a query e a âncora após a atualização. O servidor sintético registrou no máximo uma renovação simultânea.
- No mesmo ensaio, refresh 503 apresentou a recuperação sem navegar ao login; voltar a disponibilidade e clicar **Tentar novamente** recuperou a sessão. Inativar a conta fictícia produziu 401 e retorno ao login. Nenhum login Google, credencial real ou operação de negócio foi usado.
- No ensaio final, uma renovação fictícia com dois segundos de duração já estava em andamento ao clicar **Atualizar agora** em outra aba. As três retomaram a tela **Segurança**, com query e âncora preservadas, sem negações de renovação ou reutilização. Os testes automatizados também confirmam liberação por `pagehide`, escape após cancelamento e nova tentativa pelo mesmo botão.

O teste de atualização incluiu a passagem da referência compilada para a correção e uma ativação adicional em abas já controladas pelo service worker. Nessa ativação adicional, apenas um comentário do worker de teste foi alterado para gerar um aviso; o JavaScript da aplicação permaneceu idêntico. Esse marcador não pertence ao código versionado nem ao artefato de publicação.

Uma tentativa inicial da suíte com todos os workers atingiu limites de inicialização/tempo da máquina. A execução completa final com dois workers passou. O teste antigo de rotação no `App.test.tsx` foi ajustado para simular a atualização do cookie que o navegador faz ao receber a resposta, mantendo a exigência de usar o valor rotacionado.

Os comprovantes privados, logs e capturas ficam em `evidencias/pwa-sessao-2026-11-05/`. O servidor fictício e as abas temporárias foram encerrados. O ensaio local usa um modelo de API e não substitui a conferência autenticada após uma publicação autorizada.

## Publicação

Esta revisão contém somente a interface. API, banco, perfis, regras de autorização, duração das sessões e configuração do Google permanecem como estão. A publicação depende de autorização específica desta nova versão, dos testes oficiais e da aprovação normal do ambiente Production.
