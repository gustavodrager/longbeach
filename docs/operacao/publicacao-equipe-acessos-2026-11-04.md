# Publicação — Equipe e tipos de acesso

A revisão [#67](https://github.com/gustavodrager/longbeach/pull/67) foi publicada em **04/11/2026**, com interface, API, migration aditiva 33 e configuração protegida dos quatro donos confirmados. Fonte: `b93c7bbe69e8b92321cad3afd70eefb7e1885349`, branch `codex/equipe-acessos-20261104`.

O registro completo de artefatos, comprovantes e executores está em [release-equipe-acessos-2026-11-04.json](release-equipe-acessos-2026-11-04.json). Estes documentos registram a publicação dessa fonte; não representam outro deploy da aplicação.

## Resultado

- Contas individuais e tipos Bar, Professor, Atendente e Gestor disponíveis no fluxo da Equipe. O cadastro, os vínculos e a emissão de acesso continuam exigindo decisão explícita do dono. A publicação não criou usuários, não vinculou pessoas nem redefiniu senhas existentes.
- API oficial com **33 migrations**, última `20261104173051_StaffIndividualAccess`. Job único `1053dde5…`, executado após congelamento dos escritores, backup e ensaio local do backup real. Sem migration automática na inicialização. O preflight instalado foi atualizado para o schema 33 (`c47eb916…`).
- **98 tabelas e duas sequências anteriores preservadas**, incluindo dados, catálogo e ACL, na comparação congelada antes da reabertura. Inventário congelado `c4cb5b20…`; backup `04b28fbd…`; ensaio real `4352c114…`, com rede externa desabilitada e contêiner temporário removido. Os hashes completos estão no manifesto; os dados permanecem em evidência privada.
- Quatro donos existentes confirmados e utilizáveis na conferência final. A configuração persistente e a efêmera correspondem; a projeção sem os identificadores dos donos foi preservada. Google, perfis e credenciais existentes foram mantidos.
- Hosting publicado às **20:34:28 UTC**, versão `31bb82f85a094665`, release `1793824468048000`: **113 arquivos da aplicação e 115 ativos**, incluindo os dois arquivos preservados do provedor. Configuração do site preservada; artefatos oficiais com proveniência e SBOM, sem rebuild local.

## Validação e encerramento

CI `41888020965` e Production `41896828016`, tentativa 1, aprovados na fonte exata. Interface: 1.285 testes em 108 arquivos. Servidor: 696 testes unitários e 670 de integração em cada job PostgreSQL 17 e 18.

A verificação pública realizou **162 GETs, sem falhas**: os 113 arquivos oficiais, 27 entradas da interface, saúde/opções de entrada e 20 rotas privadas com resposta 401 sem credenciais. No navegador, o aviso **Atualizar agora** foi acionado e carregou `/assets/index-diZKSdf-.js`, correspondente ao artefato oficial.

A observação final da API, às **20:40:16 UTC**, confirmou schema 33, quatro serviços saudáveis, invariantes preservadas e **lease ausente**. Às **20:41:12 UTC**, foi removida somente a política temporária `65531182`; revisores, proteções e políticas originais foram conferidos e preservados.

A auditoria independente final aceitou a publicação técnica em 27 verificações, sem achados bloqueantes. O alias local `outputs/` foi restaurado após preservar 7.159 arquivos e o ledger histórico; essa limpeza não alterou a aplicação nem recursos hospedados.

Após autorização específica, o **login Google de um dono existente** abriu a Equipe, com quatro pessoas, e os quatro tipos de acesso. As configurações de Bar (seis opções) e Professor (quatro opções) foram lidas sem marcar ou salvar alterações. A recarga preservou o login, a Equipe e a entrada oficial `/assets/index-diZKSdf-.js`; a sessão permaneceu autenticada.

Essa conferência não criou ou vinculou pessoas nem alterou acessos, credenciais ou registros de negócio. O login **como Bar ou Professor**, o primeiro acesso e a redefinição de senha continuam cobertos somente pelo ambiente isolado e pelos testes automatizados. O comprovante anterior de sessão expirada e bloqueio automático foi preservado junto da autorização e do novo comprovante; não houve novo deploy.

## Operação e retorno

Usar o [procedimento da Equipe](equipe-acessos.md). O cadastro de cada pessoa e a escolha de vínculos continuam individuais; não há associação automática por nome, telefone ou e-mail nem provisionamento em massa.

Não promover a API anterior após ativar tipos restritos. Qualquer retorno precisa preservar o schema 33, as permissões atuais e os dados de acesso; não houve Down nem restauração do banco de produção nesta publicação. A restauração executada foi apenas o ensaio local isolado do backup real.
