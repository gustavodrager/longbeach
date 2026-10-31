# Correção do login Google — 31/10/2026

Correção preparada para revisão, sem publicação. O pedido é eliminar o erro de origem do Google e conferir um novo login real, preservando perfis, vínculos e os demais controles de acesso.

## Diagnóstico e mudança

O navegador interno reproduziu `GSI_LOGGER: The given origin is not allowed for the given client ID` no login oficial. A consulta somente de leitura ao cliente OAuth existente confirmou que a origem canônica `https://longbeach.quebranunca.com.br` já está autorizada. Não houve edição de cliente, origens, consentimento, chaves ou permissões no Google.

Foi feito um comparativo na origem local já autorizada, com o cliente separado de homologação e o SDK oficial. Mantendo cliente, origem e comportamento, o cabeçalho `no-referrer` reproduziu o erro. A política `strict-origin-when-cross-origin` no documento eliminou o erro e permitiu que o Google reconhecesse a conta. Aplicar a política somente ao elemento script continuou falhando. A declaração em meta no HTML também funcionou mesmo com o cabeçalho HTTP antigo, cenário relevante para documentos já guardados pelo PWA.

Firebase e os dois arquivos Nginx passam a emitir `strict-origin-when-cross-origin`. O HTML declara a mesma política antes do carregamento do JavaScript. Esse ajuste segue o [guia oficial do Google Identity Services](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) e envia apenas a origem nas consultas entre origens, sem o caminho ou a consulta da página. A mudança no HTML também altera sua revisão no precache, permitindo uma atualização normal do PWA; não é necessário apagar armazenamento ou sessão.

Não há alteração de JavaScript da aplicação, SDK, API, banco, migrations, cookies, duração da sessão, perfis, OAuth, CSP ou COOP. O cabeçalho da API permanece como está. Os componentes de login e primeiro acesso continuam consumindo o cliente informado pela API e os mesmos destinos e regras de acesso.

## Validação

- 976 testes da interface aprovados em 89 arquivos.
- 49 testes offline da publicação Google aprovados, incluindo três controles novos de política no HTML, nos três hosts e de preservação dos limites de segurança.
- Builds TypeScript/Vite/PWA e .NET aprovados, com 89 entradas no precache e zero avisos/erros na compilação da API.
- O SDK real devolveu uma resposta de autenticação no navegador interno e no Chrome usando o cliente local separado. O ensaio não enviou a credencial à API da Long Beach, não gravou a credencial e não criou conta ou cadastro.
- Atualização do PWA conferida com os builds reais antigo e candidato, na mesma origem local, sem limpar armazenamento. O antigo reproduziu o erro. Após servir o candidato, surgiu **Atualização disponível**; **Atualizar agora** carregou o HTML com a meta e o Google reconheceu a conta sem novos erros, mesmo mantendo intencionalmente o cabeçalho HTTP antigo no servidor do ensaio. Somente `index.html` e `sw.js` diferem entre os dois builds; o JavaScript permanece idêntico.

A comparação local comprova a incompatibilidade reproduzida e a resposta real do Google nesse ambiente. Não equivale a concluir o login do sistema em produção. Depois da publicação autorizada, a validação deverá entrar com uma conta já existente, conferir a área correspondente, recarregar a sessão e testar sair/entrar novamente sem criar cadastros, atribuir perfis ou alterar dados de negócio. Primeiro acesso deve manter os requisitos atuais; concluir um cadastro real depende de um caso apropriado autorizado.

## Publicação e limites

A promoção deve alterar somente a interface e seu cabeçalho `Referrer-Policy`, preservando todos os demais headers e as configurações de API, banco, perfis e Google. O artefato precisa ser identificado e passar pelos testes e pela aprovação Production. A liberação temporária deverá abranger somente a branch desta correção e ser removida ao final.

O JavaScript pode conservar o mesmo nome/hash, pois seu código não mudou. A conferência deve comparar o HTML e o service worker, a política efetiva e o fluxo do PWA, além do login real; não exigir um novo nome do JavaScript como prova dessa correção. Não limpar dados locais, cookies ou todo o armazenamento do navegador para mascarar atualização incompleta.

Evidências privadas, capturas e registros do ensaio ficam em `LongBeach/evidencias/correcao-login-google-2026-10-31/`. A publicação desta versão depende de aprovação específica.
