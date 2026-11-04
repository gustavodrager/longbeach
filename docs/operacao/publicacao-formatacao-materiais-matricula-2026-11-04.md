# Publicação — formatação, materiais e matrícula

A revisão [#66](https://github.com/gustavodrager/longbeach/pull/66), fonte `144dbe58afb51b94e700f1074ddb72dc8be9fdf7`, foi publicada em **04/11/2026**: API às **13h44**, interface às **13h50** e encerramento às **13h53**, no horário de Brasília. A [revisão funcional](../revisoes/formatacao-campos-materiais-matricula-2026-11-04.md) descreve os contratos e a prévia local. Autorização específica: **“publicar e seguir com os outros tarefas que pedi”**, abrangendo API e interface.

## Alterações publicadas

Valores em reais, telefones e CPF/CNPJ recebem apresentação em português do Brasil, preservando os valores canônicos e as conversões de centavos. Custos médios e preços unitários de NF-e conservam suas precisões próprias. Datas e competências mantêm controles nativos e valores ISO; horários e fusos permanecem preservados.

“Onde fica guardado” passa a ser opcional no cadastro e nas movimentações de materiais, inclusive na demonstração. O local informado conserva o limite de 160 caracteres; unidade, quantidade, motivo, destino, responsável, versão e proteção contra repetição continuam sujeitos às regras existentes.

“+ Cadastrar aluno” permite selecionar ou cadastrar a pessoa durante a matrícula e voltar ao rascunho sem perder turma, datas ou mensalidade. Reaproveita Clientes e a ficha escolar existente, mantém as permissões separadas e não cria automaticamente uma conta de acesso `User`.

## Qualidade e artefatos

O [CI da fonte 41856396234](https://github.com/gustavodrager/longbeach/actions/runs/41856396234) aprovou as quatro verificações de qualidade. As matrizes PostgreSQL **17 e 18 tiveram, cada uma, 668 testes unitários e 600 integrações**, sem falhas ou ignorados. A interface aprovou **1.214 testes em 101 arquivos**, além dos builds e da verificação do transporte WhatsApp. A [execução Production 41859833866](https://github.com/gustavodrager/longbeach/actions/runs/41859833866), **tentativa 1**, concluiu os cinco jobs com sucesso e aprovação do ambiente registrada.

Os artefatos oficiais tiveram proveniência, lista de componentes e bytes conferidos, sem reconstrução local. A interface contém **110 arquivos de aplicação, 3.243.808 bytes** e **112 arquivos ativos**, incluindo os dois arquivos preservados do provedor. O `50x.html` herdado da imagem base ficou fora da árvore publicada.

| Artefato | Identificação |
|---|---|
| API, índice OCI | `sha256:85a564418dd1de8f862991b9c8160bf6e390645bf0f8eae4247353757bb750db` |
| API, configuração da imagem | `sha256:67b90fc91aeb7bcc3ea16bfeaa9939d0464056e1ce354f2b7ff69b9c23be100b` |
| Interface, índice OCI oficial | `sha256:ef8d54ba0fdbec26877c267786ad389d73eb3f6b8bb9f616da06d21c579355b2` |
| Árvore da interface, SHA256 | `06a7529369f53a9efb0c2e6c3c5b6224f112ccb5bca919abbea8d823c5fd6c84` |
| Hosting, versão / publicação | `1aab3c27ea86f0f5` / `1793811024932000` |
| Entrada da interface/PWA | `/assets/index-CLqVISNn.js` |
| Identidade final da API/banco, SHA256 | `959bfce5e84a56285bbfcea176ea4b053f8ef118250f19a2052fc38212596f3b` |

A prévia local isolada conferiu máscaras, cadastro e seleção de aluno durante a matrícula, preservando turma, datas e mensalidade de R$ 125,50, além de material sem local com movimentos de saldo 0 → 5 → 15. A matrícula também foi conferida em 390 × 844, sem transbordamento horizontal. Esses ensaios usaram dados fictícios; não comprovam repetição dos fluxos autenticados em produção.

## Conferência publicada e preservação

A conferência pública passou em **207 GETs**: **110 arquivos**, **72 rotas SPA**, **23 rotas privadas com `401`** e duas consultas de prontidão/opções, com **zero falhas** e TLS conferido. No navegador isolado, apareceram a entrada pública e o login; o aviso do PWA e **Atualizar agora** trocaram a entrada anterior `index-BpFX4Y74.js` por `index-CLqVISNn.js`, correspondente ao artefato oficial. Os campos de login permaneceram vazios; não foram enviadas credenciais, executados OAuth/login do aplicativo ou criados registros de negócio para teste.

A API ficou saudável e o banco permaneceu no **schema 32**, migration mais recente `20261102163528_ClientIndividualAccess`, hash `e68bb0b2cacc3f30bd53bbda0ce192f7803708bef66e2fdfeb800f29016884a0`. A observação final foi registrada às **16:53:00 UTC** e comprovou os invariantes admitidos de banco, ACLs, perfis, configuração e flags. **Login local segue habilitado; autocadastro público local segue fechado.** A implantação não executou migrations, seeds ou SQL de escrita, nem alterou credenciais ou perfis.

Somente `API_IMAGE` mudou no runtime. PostgreSQL, Caddy e WhatsApp preservaram contêineres, imagens, horários de início e redes, sem reiniciar a ponte. Configuração do Hosting e os dois arquivos do provedor foram preservados. Sessões, auditoria e uso normal continuam podendo gerar escritas legítimas. Google, telas autenticadas e preservação de uma sessão já aberta não foram retestados nesta publicação; a conferência pública não substitui esses testes.

## Conferência anterior das contas

Uma leitura privada **anterior à publicação**, na fonte `89951e5282280c0382855f72eabfdb101f592f4e`, registrou às **16:22:48 UTC** **49 clientes canônicos**, **48 sem conta própria** e **46 incompletos**; **45** estavam nos dois grupos. Essas contagens não devem ser somadas como pessoas distintas. Um grupo de nomes semelhantes é candidato à conferência humana, sem confirmar duplicidade ou identidade. Não foram criadas ou associadas contas, unificadas fichas, emitidos convites ou links de recuperação, alteradas autorizações ou habilitado cadastro público.

O snapshot é pontual, tem contatos mascarados e permanece privado em `evidencias/formatacao-materiais-matricula-2026-11-04/conferencia-contas/baseline-89951/`. Seu contexto e hashes estão no manifesto; ele não é apresentado como auditoria de contas posterior à publicação. O novo pedido de acesso da equipe, telefone e tipos de permissões permanece em análise para aprovação; não foi implementado nem provisionado nesta operação.

## Encerramento e reversão

Durante a espera, o GitHub informou um [incidente de Actions e Pages](https://www.githubstatus.com/incidents/xr3myzj7ms51), enquanto os metadados de jobs ainda estavam pendentes. A causa específica deste atraso não foi confirmada. A mesma execução, tentativa 1, depois concluiu oficialmente com sucesso, **sem cancelamento, nova tentativa ou desvio dos gates**. Uma inferência inicial prematura de qualidade concluída foi corrigida por recibo adicional; o recibo anterior e o snapshot pendente foram preservados. A observação oficial posterior dos cinco jobs verdes fundamentou a promoção. O adendo de descrição da publicação também preserva a versão anterior e comprova a mudança restrita a um literal.

A reserva global foi arquivada e removida às **16:52:19 UTC**; a observação final confirmou sua ausência. Foi removida somente a política temporária **65506221**, e as políticas, os revisores e as demais proteções originais foram restaurados às **16:53:36 UTC**.

A auditoria independente final aprovou **51 conferências, sem pendências bloqueantes**. Vinculou os recibos de artefatos, publicação, conferência pública, navegador, preservação, encerramento da reserva e restauração das proteções; uma leitura independente do GitHub confirmou as políticas e os revisores originais. O hash desse recibo está no manifesto.

A API anterior `southamerica-east1-docker.pkg.dev/parsero-prod-20261022/longbeach/api@sha256:0634ea85311ce294ae1876c532ffd6c00174228fe4501254c874d62e03612875` e o Hosting anterior `7a7dcbb424c5c1e5` / `1793740199362000` permanecem referenciados, junto da configuração anterior, para uma reversão de aplicação compatível com schema 32 e sujeita à conferência dos registros ativos. Não houve rollback automático, `Down` ou restauração de banco.

O [manifesto final](release-formatacao-materiais-matricula-2026-11-04.json) vincula artefatos e hashes dos recibos, sem publicar dados pessoais ou segredos. Recibos privados: `evidencias/formatacao-materiais-matricula-2026-11-04/publicacao-144dbe5/`, fora do app. Estes documentos são registros posteriores à verificação final; não promovem outra versão. Os dois arquivos locais anteriores de outras operações e todo o histórico de comprovantes foram preservados.
