# Publicação — cadastro e atividades dos clientes

A revisão [#65](https://github.com/gustavodrager/longbeach/pull/65), fonte `89951e5282280c0382855f72eabfdb101f592f4e`, foi publicada em **03/11/2026**: API às **17h57**, interface às **18h09** e encerramento às **18h14**, no horário de Brasília. A [revisão local](../revisoes/cadastro-cliente-clean-2026-11-03.md) descreve o cadastro simplificado e os tipos cumulativos de cliente.

Autorização específica: **“Pode publicar a revisão #65 quando todos os testes passarem, atualizando a interface e a API e mantendo banco, perfis e configuração do Google como estão.”** A aprovação do ambiente foi registrada após a qualidade. [CI 41636394016](https://github.com/gustavodrager/longbeach/actions/runs/41636394016): quatro verificações aprovadas; [Production 41698947603](https://github.com/gustavodrager/longbeach/actions/runs/41698947603), tentativa 1: cinco jobs aprovados.

Passaram **1.154 testes da interface em 97 arquivos**, **662 unitários e 599 integrações por matriz PostgreSQL 17 e 18**, sem falhas ou ignorados, além dos builds, guardas e transporte. A preparação operacional teve **191 testes offline**. Os artefatos oficiais tiveram proveniência, lista de componentes e bytes conferidos, sem reconstrução local.

| Artefato publicado | Identificação |
|---|---|
| API, índice OCI | `sha256:0634ea85311ce294ae1876c532ffd6c00174228fe4501254c874d62e03612875` |
| API, configuração da imagem | `sha256:9d405c1789aa7dfcfe9e52396273447eccb6316b73f51a611ae0bf9ac80e8fcb` |
| Interface, índice OCI oficial | `sha256:d6bc4b7aaa66daf8de6dc0bca73565841a10816dde213039855f8016cb237ac6` |
| Hosting, versão / publicação | `7a7dcbb424c5c1e5` / `1793740199362000` |
| Entrada da interface/PWA | `/assets/index-BpFX4Y74.js` |

A API ficou saudável e o banco permaneceu no **schema 32**, com ACLs, perfis, Google e flags preservados. **Login local segue habilitado; autocadastro público local segue fechado.** Não houve migrations, seeds ou SQL de escrita pela implantação. Somente `API_IMAGE` mudou no runtime; PostgreSQL, Caddy e WhatsApp conservaram contêineres, imagens, horários de início e redes, sem reiniciar a ponte. Configuração do Hosting e arquivos do provedor também foram preservados. Sessões, auditoria e uso normal continuam podendo gerar escritas legítimas.

A conferência pública passou em **203 GETs**, verificando **106 arquivos**, TLS, prontidão `200` e **23 rotas privadas com `401`**, sem falhas. No navegador, o cadastro mostrou Nome e Telefone antes do Google; em **390 × 844**, não houve transbordamento e Continuar ficou visível. Foco obrigatório e Tab foram conferidos. O aviso do PWA e **Atualizar agora** funcionaram em navegador separado, com a nova entrada; a dimensão foi restaurada.

Cadastro e edição autenticados já foram exercitados na prévia local e nas integrações; não foram repetidos contra registros reais para preservar a aba em uso. **Login Google real e preservação da sessão existente não foram retestados nesta publicação.** Não foram criadas contas, convites, cobranças ou outros registros de negócio para teste, nem enviadas credenciais do aplicativo.

A reserva global foi arquivada e removida; a observação final confirmou sua ausência e a preservação da API/banco. Foi removida somente a política temporária **65396596**. Políticas anteriores, revisores e demais proteções foram restaurados. A API anterior `sha256:914f602b2feb0e764fa4ba11696990a0cced8eaf9885db7d830fc1c02953c570` e o Hosting anterior `9386ee9c4c395192` permanecem referenciados para reversão compatível, com a configuração anterior preservada. Não houve rollback automático, `Down` ou restauração de banco.

O [manifesto](release-cadastro-cliente-clean-2026-11-03.json) registra as versões e os limites. Recibos privados: `evidencias/cadastro-cliente-clean-2026-11-03/publicacao-89951e5/`, fora do app; não são publicados dados pessoais ou segredos. Estes documentos são registros posteriores, sem outra promoção de código. Os dois arquivos locais anteriores de outras operações foram preservados.
