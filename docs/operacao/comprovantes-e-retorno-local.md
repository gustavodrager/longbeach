# Comprovantes e retorno local — 27/10/2026

A migração Google Cloud foi aceita e concluída em 26/10/2026, com retirada da origem e da homologação e publicação posterior da aplicação consolidada. Em 27/10, o chat Google Cloud confirmou o encerramento e liberou o arquivamento local. A revisão não identificou helpers em execução, gravações abertas ou contêineres vinculados a outputs. Os handles do Docker encontrados eram somente de leitura.

## Organização concluída

- Diretório real: `LongBeach/evidencias/outputs/`.
- Alias histórico: `LongBeach/outputs -> evidencias/outputs`.
- O índice antigo `evidencias/operacoes-em-andamento -> ../outputs` continua funcionando para consulta.
- Novas evidências usam outras pastas em `evidencias/`; preservar a árvore histórica sem novas gravações.

A árvore inteira foi movida por rename no mesmo volume: 7.159 arquivos, 1.079.013.826 bytes e 65 symlinks. A conferência comparou SHA-256 de todos os arquivos regulares, caminhos, proprietário/grupo, permissões, inodes, tamanhos, horários de modificação e alvos dos links. Os comprovantes, planos, dumps, checkpoints, intenções e falhas intermediárias permaneceram intactos. Não houve cópia adicional dos dados nem chamada à nuvem.

O movimento foi revertido em ensaio local: outputs voltou como diretório real no caminho original, com integridade conferida e caminhos canônicos aprovados. Depois, a organização foi repetida para o destino final. Nenhum helper operacional da migração foi importado ou executado no ensaio.

## Registros da conferência

Em `LongBeach/arquivo/consolidacao-2026-10-26/`:

- `suportes-execucao-20261027T121710Z-a88a00cef9.json`: movimento do ensaio e sua reversão, status `rolled_back`.
- `suportes-execucao-20261027T121733Z-61cd6d24fe.json`: recibo final, status `completed`, com inventário e hashes para retorno.
- `fechamento-outputs-2026-10-27/`: liberação coordenada, revisão de recuperação/dependências, prova dos caminhos reais, seis testes de rename exclusivo e relatório final.

Esses registros são privados, fora da árvore movida, com permissão 0600 em diretório privado. O script de organização recusa atomicamente destinos existentes, inclusive diretórios vazios e links quebrados. Os seis testes isolados conferiram sucesso e recusa de sobrescrita antes do movimento real.

Os encerramentos operacionais prioritários, relativos a `evidencias/outputs/`, são:

- `google-vm-2026-10-26/private/final-retirement-final-validation.json`.
- `google-vm-2026-10-26/private/release-full-20261026/final-production-release-validation.json`.
- `google-vm-2026-10-26/private/release-full-20261026/root-release-checkpoint.json`.

O `root-safe-resume-checkpoint.json` preserva campos e próximos passos antigos, anteriores aos encerramentos. Consultar os registros finais posteriores; não corrigir o arquivo histórico ou repetir seus passos automaticamente.

## Restaurar somente o caminho local

O alias preserva consultas e referências comuns, mas não a execução canônica. Ferramentas como `source-freeze.py`, verificadores de retirada/permissões e promoção web exigem caminhos reais, profundidade fixa ou correspondência literal com recibos. Não remover essas guardas nem reescrever planos/hashes para adaptar o arquivo.

Antes de considerar uma dessas ferramentas, coordenar o uso da pasta e encerrar todos os gravadores locais. Conferir que o recibo abaixo ainda é o recibo final aplicável. A partir da pasta principal LongBeach, planejar a reversão:

```sh
python3 -B arquivo/consolidacao-2026-10-26/organizar-suportes.py --rollback /Users/gustavo-drager/Works/LongBeach/arquivo/consolidacao-2026-10-26/suportes-execucao-20261027T121733Z-61cd6d24fe.json
```

Depois de conferir o plano e a ausência de gravadores, executar a mesma reversão:

```sh
python3 -B arquivo/consolidacao-2026-10-26/organizar-suportes.py --rollback /Users/gustavo-drager/Works/LongBeach/arquivo/consolidacao-2026-10-26/suportes-execucao-20261027T121733Z-61cd6d24fe.json --apply --ack-quiescent
```

O procedimento confere todos os hashes/metadados, remove somente o alias esperado e devolve a árvore como `LongBeach/outputs`, diretório real. Não sobrescreve uma origem recriada. Se qualquer arquivo tiver mudado ou houver divergência, a reversão automática será recusada; preservar o estado e revisar as alterações antes de seguir. Não apagar arquivos, editar o inventário ou forçar a reversão para fazê-la passar.

Conferir novamente `outputs.resolve() == outputs`, os caminhos necessários, permissões e hashes antes de uma nova revisão operacional. Para organizar outra vez após o uso, executar o dry-run `--only outputs --compat-outputs`, coordenar a quiescência e só então aplicar; será criado outro recibo final, que deve substituir a referência deste guia. Restaurar o caminho não renova janelas, autenticação ou autorizações antigas.

## Recuperação atual de produção

O retorno do diretório local preserva o acesso às evidências. A produção opera na VM e não depende de outputs no Mac. A origem Cloud SQL/Run foi removida; recuperação exige reconstrução e restauração/reconciliação dos dados atuais, com nova revisão e autorização. Não executar o protocolo antigo de reabertura da origem ou reaplicar planos de retirada.

Usar o [runbook atual da VM](google-vm.md), o [registro da release atual](release-google-vm.json) e o [procedimento de backup/restauração](../../deploy/google/vm/backup/README.md). A release identifica a imagem vigente; o pin de bootstrap/Terraform preserva a preparação histórica. Manter API e workers parados no candidato, restaurar em diretório vazio, conferir replay, schema, dados, totais, sequências, permissões e sessão, reconciliar gravações recentes e só então revisar a retomada.

As raízes canônicas de infraestrutura são `deploy/google/vm/terraform`, `deploy/google/support/terraform` e `deploy/google/staging-retired/terraform`, cada uma com backend próprio. Não reaplicar `deploy/google/terraform`, raiz histórica que recriaria recursos retirados. Preservar projetos e buckets necessários aos backups nativos e ao GCS.

O código antigo em `arquivo/ambientes-anteriores/`, acessível pelo alias `work/`, continua preservado. Alguns helpers também dependem de Python/SDK externos e de autenticação temporária em `/private/tmp`; essas dependências não são garantidas pelo arquivo e precisam ser conferidas ou reconstituídas em uma operação futura. Renovar a autenticação oficial; não copiar credenciais temporárias como artefato de recuperação. A revisão privada lista os caminhos e contratos específicos.
