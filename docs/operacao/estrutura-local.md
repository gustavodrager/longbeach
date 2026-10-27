# Estrutura e operação local

## Diretórios

- `LongBeach/longbeach-os`: aplicação principal, Git, frontend, backend e documentação.
- `LongBeach/dados-locais`: configuração privada, importações e backups locais.
- `LongBeach/evidencias`: relatórios, capturas e recibos de operação.
- `LongBeach/arquivo`: preservação das bases anteriores e reconciliação.

`work/` é o alias de compatibilidade para `arquivo/ambientes-anteriores/`. A migração Google Cloud terminou e `outputs/` agora é o alias de consulta para `evidencias/outputs/`; o índice histórico `evidencias/operacoes-em-andamento` continua funcionando. O retorno do diretório real foi ensaiado, preservando todos os arquivos. Ferramentas históricas com exigência de caminho canônico dependem desse retorno e de nova revisão, conforme o [guia dos comprovantes](comprovantes-e-retorno-local.md). Novos trabalhos usam a aplicação principal; novas evidências usam pastas próprias em `evidencias/`.

## Iniciar e encerrar

Abra `iniciar-local.command` na pasta principal LongBeach. O wrapper encaminha para esta aplicação. `encerrar-local.command` encerra somente processos identificados como pertencentes ao checkout e preserva os dados do banco.

Para iniciar sem abrir o navegador automaticamente, use `LONGBEACH_OPEN_BROWSER=false ./iniciar-local.command` a partir da pasta principal.

A configuração padrão é `../dados-locais/configuracao/longbeach-local.env`, fora deste repositório. Selecione outro arquivo com `LONGBEACH_LOCAL_ENV`. O launcher valida Staging, API `localhost:5320` e banco local `longbeach_profiles_preview`, porta 55439. A interface usa `http://localhost:5321`.

O contêiner existente é `longbeach-perfis-test`. O nome é histórico; o volume é preservado. A organização de diretórios não executa migrations. O launcher mantém migrations, seeds e bootstrap desabilitados. Uma atualização de schema local exige execução explícita e conferida.

O launcher confere somente os IDs de migrations antes de abrir a aplicação. Na consolidação de 26/10, seis migrations pendentes foram aplicadas com autorização específica, após backup, restauração e ensaio em clone. A conferência daquela etapa registrou 27 migrations na prévia. Em futuras divergências, o launcher encerra com orientação e preserva o banco; atualizações que alterem registros exigem revisão e um caminho concreto de restauração.

A branch `codex/estoque-materiais-20261027` acrescenta o controle de movimentações de materiais e a migration aditiva `20261027135728_MaterialStockLedger`. Em 27/10, a prévia foi atualizada explicitamente de 27 para 28 migrations, após backup privado com permissão 0600, restauração e ensaio aprovados. As 59 tabelas anteriores e uma sequência permaneceram idênticas; o novo histórico de materiais ficou vazio. O [registro da integração](integracao-estoque-materiais-2026-10-27.md) reúne as validações e as evidências dessa atualização local.

Executar o código do checkout na prévia continua dependendo da correspondência entre o schema conferido e as migrations do backend. O launcher verifica essa condição e mantém a aplicação automática de migrations desabilitada. Esta atualização local não executou migrations em produção.

## Testes e configuração

Testes PostgreSQL usam somente uma conexão exclusiva cujo banco contenha `test`. A base de prévia e produção permanecem fora desses testes. O CI usa dados fictícios e verifica restauração sintética.

Frontend: `pnpm --dir frontend test` e `pnpm --dir frontend build`. Backend: executar `dotnet build` e `dotnet test` dentro de `backend/` para selecionar o SDK fixado. Importadores: `python3 -m unittest discover -s scripts -p 'test_*.py'`. Testes de publicação: `deploy/google/tests/`.

A conferência de schema do launcher é testada por `node --test scripts/check-local-schema.test.mjs`, com contêiner simulado, incluindo aliases Npgsql, campos duplicados e vínculo da porta local. Nenhum desses testes acessa um banco real.

Versionar somente modelos `.env.example`. Configurações privadas usam 0600 e diretórios privados usam 0700. Dados, dumps, chaves, estado Terraform, dependências e logs ficam fora do Git.

O material em `arquivo/` serve à recuperação e à revisão do trabalho anterior. Os utilitários em `tools/` exigem parâmetros e invocação explícita; atalhos e builds não executam rotinas administrativas.
