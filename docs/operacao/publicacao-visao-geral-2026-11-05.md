# Publicação da Visão Geral — 05/11/2026

Publicada somente a interface da [revisão #68](https://github.com/gustavodrager/longbeach/pull/68), fonte `707916e70512d7f54e52d76b55a59944d0e8ba09`, às **22:27 UTC / 19:27 em Brasília**. A Visão Geral foi simplificada e o indicador de reservas foi retirado. Os ajustes posteriores do Bar não fazem parte desta publicação.

## Artefato e conferência

- [CI oficial](https://github.com/gustavodrager/longbeach/actions/runs/42108168296) aprovado na fonte exata. [Production](https://github.com/gustavodrager/longbeach/actions/runs/42110211537), tentativa 2, aprovado com os cinco trabalhos efetivos. O PostgreSQL 18 da primeira tentativa atingiu o limite; a repetição normal passou sem mudar fonte ou requisitos. O histórico bruto das duas tentativas foi preservado, distinguindo trabalhos reutilizados de execuções novas.
- Em cada PostgreSQL 17/18: 696 testes unitários e 670 integrações aprovados, sem falhas nem ignorados. Interface oficial: 1.287 testes aprovados. A restauração do backup sintético do pipeline também passou.
- Pacote oficial web `sha256:fa99e00314bf7672fd4771a154a1c22219d668d394c3e79aa03d929affaef227`, com procedência e SBOM conferidos, **sem rebuild local**. Foram promovidos **110 arquivos da aplicação e 112 ativos**, incluindo os dois arquivos preservados do provedor.
- Hosting: versão `08fa845dd94a61dc`, release `1793917620450000`. Configuração preservada: `cef1ccb938ce3c635701cae66b8fdac027b14b5834b797a5c2797523feac62c9`.
- **131 conferências públicas aprovadas**, incluindo os arquivos publicados, 13 entradas de página, prontidão/configuração da API e quatro acessos privados recusados sem autenticação. Não houve login nem alteração de dados de negócio nessa conferência.
- O navegador exibiu **Atualização disponível** e o botão **Atualizar agora** carregou o pacote oficial: `/assets/index-diZKSdf-.js` → `/assets/index-X7oztnAe.js`. A aba temporária foi encerrada.

API, banco, contas, perfis, acessos da equipe e Google foram preservados. Não foram executados migrations, comandos na VM ou alterações de DNS. A configuração dos revisores permaneceu intacta; somente a regra temporária `65670282`, da branch desta revisão, foi removida ao concluir.

O pacote anterior (`31bb82f85a094665`, release `1793824468048000`) permanece identificado nos recibos como referência de retorno da interface. Este registro não autoriza nova promoção, retorno, mudança de banco ou alteração de proteções.

## Evidências

Comprovantes privados locais em `evidencias/visao-geral-clean-2026-11-05/publicacao-707916e/`, fora do repositório da aplicação. O fechamento é `publication-completed.attempt2.private.json`, que vincula pelos hashes o gate oficial, o pacote, a publicação, as conferências públicas, o teste do PWA e a restauração das proteções.

Os executores históricos e seus recibos foram preservados. Um adaptador local, testado e revisado, tratou um único marcador Unicode BOM no cabeçalho do registro oficial; os bytes brutos do registro e as demais verificações do artefato permaneceram intactos. Nenhum requisito de qualidade foi contornado.
