# Publicação — exclusão de turmas

## Resultado

A revisão [#63](https://github.com/gustavodrager/longbeach/pull/63) foi publicada em 02/11/2026 após a autorização **“publicar”** do proprietário. A API iniciou a nova imagem às **12h12** e a interface foi promovida às **12h18**, no horário de Brasília.

O Gestor encontra **Excluir turma** na ficha da turma. A confirmação informa a consequência definitiva. Turmas com alunos ou qualquer histórico vinculado continuam protegidas e devem ser encerradas. A publicação atualizou API e interface, sem migrations, comandos de alteração de perfis ou mudanças na configuração do Google.

## Versão e verificações

- Código publicado: `6efa2a7b4b182086effaafb60e62ee4f8c20e152`, branch `codex/excluir-turma-20261102`.
- Revisão original da funcionalidade: `e409125fa44b29dc4764b185e803a2c0ee7a5c54`. O único ajuste posterior isolou os testes de integração em schemas descartáveis; as árvores da interface, do código executável da API e da implantação permaneceram idênticas.
- [CI da revisão](https://github.com/gustavodrager/longbeach/actions/runs/41460920105): quatro verificações aprovadas, incluindo PostgreSQL 17 e 18, interface/PWA e transporte WhatsApp.
- [Production](https://github.com/gustavodrager/longbeach/actions/runs/41463946003), tentativa 1: quatro verificações de qualidade e publicação das imagens aprovadas. A aprovação do ambiente ocorreu após a qualidade estar aprovada, preservando os revisores obrigatórios.
- A primeira CI da versão original detectou interferência de uma nova fixture no teste financeiro existente. A correção ficou restrita aos testes; os 12 casos de exclusão e os dois casos financeiros passaram juntos localmente antes das duas execuções completas aprovadas.
- A validação local inicial teve 230 testes afetados aprovados, com 57 novos, além dos builds. O registro dessa etapa em `docs/revisoes/exclusao-de-turmas-2026-11-02.md` permanece histórico; a publicação e a conferência no navegador estão registradas aqui.

## Artefatos publicados

| Componente | Identificação |
|---|---|
| API, índice OCI | `sha256:759d0f8dc33f8fdde799a6305cd26f95d25286fbbbe7d49242745db381b9bc29` |
| API, configuração da imagem em execução | `sha256:141db791eeb324860aec3c0b3c92ff03e337ea508d3f0e6bf1d325303fbf17ec` |
| Interface, índice OCI oficial | `sha256:68b7d560769b3c7521ce926341b9ddbdb5e418b2d9a2d8f30e65262decf159a9` |
| Interface, árvore extraída | `ebd22ceb0936a9daa76a24acf5c814cccba164973e90ce3aa88ee7f650a1d270` |
| Hosting, versão | `f1842243895fa0e9` |
| Hosting, publicação | `1793632722983000` |

Foram conferidas a proveniência, a lista de componentes e a correspondência dos bytes publicados. O Hosting contém 103 arquivos da aplicação e dois arquivos preservados do provedor. As 190 consultas públicas de verificação passaram, incluindo hashes dos arquivos, páginas, TLS e recusa de acesso privado sem autenticação. Essas consultas não executam a interface; o ensaio real está descrito abaixo.

## Conferência no sistema publicado

- API pronta com resposta `200`; preflight da nova rota com `204` e origem autorizada. A tentativa sem autenticação, com identificador vazio e sem versão, recebeu `401`, sem enviar uma exclusão válida.
- O aviso do PWA foi exibido e **Atualizar agora** ativou `/assets/index-C7H8WAnE.js`. Após a atualização, o navegador solicitou login novamente. O acesso normal pelo Google com a conta de Gestor existente funcionou, retornando à ficha da turma.
- **Excluir turma** abriu a confirmação com aviso de irreversibilidade e foco inicial em **Cancelar**. A operação foi cancelada; nenhuma exclusão autenticada foi enviada. As nove fichas da lista, incluindo horários e ocupação, permaneceram iguais à conferência anterior.
- Nenhum erro de console ou transbordamento horizontal foi observado no tamanho normal do navegador. O ensaio não alterou o tamanho da janela.

Nenhuma turma real foi excluída. A remoção efetiva, os bloqueios por histórico, a concorrência e as permissões dos demais perfis foram exercitados nos testes automatizados isolados, sem usar contas ou registros de produção para esses cenários.

## Preservação e encerramento

A API permaneceu saudável. PostgreSQL, Caddy e transporte WhatsApp conservaram os mesmos contêineres, imagens, horários de início e redes. Foram preservados o catálogo do banco, as 31 migrations, os vínculos de usuários e perfis, os parâmetros de autenticação e Google e os limites do transporte. A alteração do arquivo de ambiente ficou restrita à referência da imagem da API. A publicação não executou migration, seed ou alteração de dados de negócio; a atividade normal de sessões, auditoria e tarefas do sistema continua possível.

A reserva temporária da implantação foi arquivada e encerrada. A política temporária de branch `65233163` foi removida; as políticas anteriores, os revisores e as demais proteções foram conferidos após a remoção. As referências da API e do Hosting anteriores foram retidas para eventual retorno controlado; nenhum retorno foi executado.

O manifesto novo `release-exclusao-turmas-2026-11-02.json` contém as referências e hashes dos comprovantes. Os comprovantes privados permanecem em `evidencias/exclusao-turmas-2026-11-02/publicacao-6efa2a7/`, fora do repositório da aplicação. Registros anteriores, o manifesto local de outra operação e o documento local de publicação de clientes foram preservados.
