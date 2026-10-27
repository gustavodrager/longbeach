# Consolidação local — 26/10/2026

## Origem preservada

A auditoria encontrou nove áreas em `work/`, sustentadas por dois repositórios Git: `longbeach-perfis` e `longbeach-notas-release`. A base `efa1967` inclui o código publicado `932f1f6` e o registro posterior dessa release. A cópia principal parte de `0ba01b9`, que acrescenta a preparação da VM econômica salva pela frente Google Cloud.

O clone usa objetos próprios (`--no-hardlinks`), preserva as branches de notas-release e refs `arquivo-perfis/*` da segunda história. `origin` aponta para GitHub. Esta consolidação não envia mudanças ao remoto nem publica a aplicação.

Bundles verificados, patches binários, arquivos novos e inventários privados estão em `LongBeach/arquivo/consolidacao-2026-10-26/preservacao-git/`. Os arquivos ignorados de runtime/configuração e dados permanecem nos originais até sua organização específica.

## Reconciliação

- C6 e Visão Geral têm alterações equivalentes já incorporadas.
- Despesas já foi incorporado funcionalmente; preservar o documento local remanescente.
- Current Finance contém documentos exclusivos de suporte/homologação.
- Perfis contém trabalho local em materiais/estoque, migrations e testes. Inventário e patches ficam preservados; integração funcional exige revisão separada.
- Google Cloud estava ativo. Conferir seu trabalho posterior à base copiada antes de arquivar os caminhos que utiliza.

## Estrutura

`app/` virou `frontend/`. `src/`, `tests/`, solução e arquivos .NET foram movidos juntos para `backend/`. CI, Dockerfiles, exclusões, branding, cópia da auditoria SQL nos testes e compilação Google foram ajustados. O build Google continua reconhecendo os commits históricos com `app/`.

Launchers passam a usar a aplicação principal e configuração privada externa. Utilitários ficam em `tools/`, com referências ao backend consolidado e parâmetros locais explícitos.

## Validação e organização final

Validação aprovada: frontend com 554 testes (58 arquivos), checagem TypeScript e build PWA; backend com 472 unitários e 367 integrações, sem ignorados, build/publish sem erros ou avisos. A API publicada foi iniciada em banco vazio exclusivo de teste: 27 migrations, readiness 200 e acesso anônimo a auth/me 401. O processo e o contêiner descartáveis foram encerrados.

Também passaram 14 testes dos importadores, 46 testes de publicação/layout histórico e os builds dos quatro utilitários. Nenhum utilitário administrativo foi executado. Os 308 arquivos originais do frontend e 270 de código backend são idênticos ao commit base; nos testes só mudou a referência ao SQL de auditoria.

Evidências em `LongBeach/arquivo/consolidacao-2026-10-26/validacao-estrutura.json`, `validacao-backend.json` e logs privados em `validacao/`. A instalação de dependências foi feita de forma independente, com o mesmo lockfile e sem symlinks para os diretórios anteriores.

Capturas foram movidas de artifacts para evidencias/artifacts; importações pendentes foram movidas para dados-locais/importacoes-pendentes, com integridade conferida. A configuração privada local foi copiada com permissão 0600 para dados-locais/configuracao/longbeach-local.env. Os atalhos originais foram preservados antes de apontar para a aplicação principal.

O responsável autorizou separadamente atualizar também a prévia local com backup e ensaio. O dump custom foi restaurado em clone PostgreSQL 17; contagens, hashes e sequências conferiram antes do ensaio das seis migrations. Após o ensaio aprovado e a fonte ainda idêntica ao backup, a prévia foi atualizada de 21 para 27 migrations. Usuários e campos anteriores foram preservados. O backup privado fica em dados-locais/backups/; recibo em arquivo/consolidacao-2026-10-26/atualizacao-previa.json. Nenhuma migration de produção foi executada por esta consolidação.

A coordenação confirmou ausência de gravadores e liberou arquivar work preservando seu alias. As nove áreas e os quatro utilitários originais foram movidos integralmente para arquivo/ambientes-anteriores; o alias work mantém os caminhos anteriores. O recibo ambientes-execucao-20261026T190140Z-c644bd3025.json comprova 74.671 arquivos preservados e os nove HEAD/status Git idênticos após o movimento.

**Exceção operacional: outputs permanece como diretório real.** O helper source-freeze.py e referências de planos com hashes fixados exigem caminhos canônicos (p.resolve() == p). Converter outputs em symlink impediria a retomada e a conferência de retorno. Não houve movimento ou edição de seus checkpoints. O índice evidencias/operacoes-em-andamento apenas aponta para outputs; sua origem continua real. Essa pendência foi explicitamente coordenada com o chat Google Cloud.

A referência final dessa frente, 298bf244a62049ea22bcb56b50cdd4fb9bee3c9d, foi preservada em refs arquivo-notas/* e em um bundle final verificado. Após 0ba01b9 ela altera somente ADR-015 e o runbook google-vm.md; ambos foram incorporados à aplicação principal. A coordenação foi informada do novo caminho e da liberação das gravações operacionais.


## Abertura pelo atalho

O wrapper da pasta principal iniciou a aplicação consolidada sem abrir o navegador principal. Schema: 27 migrations; build Debug da API sem avisos/erros; API localhost:5320 e Vite localhost:5321. No navegador temporário, a página /login exibiu a marca e o botão Google, após GET /api/v1/auth/options 200. /health/ready retornou 200 Healthy e /api/v1/auth/me sem sessão retornou 401. O console não apresentou avisos ou erros. A conferência parou na tela de login: não houve autenticação Google nem lançamentos de negócio. A aba e os processos criados para o teste foram encerrados; o contêiner da prévia foi preservado.

O launcher agora confere schema e vínculo do contêiner/porta em leitura antes da inicialização. Quatro testes CLI cobrem schema pendente, aliases/duplicados da conexão e destino/porta divergentes.

A branch local é codex/consolidacao-estrutura-20261026, com HEAD na referência final298bf244 e a reorganização preparada no índice para revisão. Não houve push ou publicação por esta etapa.
