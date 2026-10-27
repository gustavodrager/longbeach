# LongBeach no Google Cloud — entrega de 25/10/2026

**Migração concluída em 25/10/2026**, com infraestrutura, DNS, rotinas, conferência no navegador e encerramento dos acessos temporários verificados. Os recibos finais desse corte foram registrados após **02h20, horário de São Paulo**. O banco canônico naquele corte era `longbeach`, **OID 24760**, no Google; o candidato arquivado e a origem Railway não eram a base oficial. O Financeiro foi publicado posteriormente no mesmo dia, conforme a [entrega dessa release](financeiro-google-cloud-2026-10-25.md), com 27 migrations. O estado atual está no [registro da release na VM](release-google-vm.json) e no [runbook da VM](google-vm.md). As datas anteriores no [runbook técnico](google-cloud.md) são históricas; as contagens abaixo preservam a cópia final da migração, ainda com 26 migrations.

## Acessos e estrutura

| Uso | Endereço ou recurso |
| --- | --- |
| Site do LongBeach | <https://longbeach.quebranunca.com.br> |
| API do LongBeach | <https://api.longbeach.quebranunca.com.br> |
| Administração Google | Conta `parserotech@gmail.com`; autenticação e segundo fator diretamente no Google |
| Produção | [Parsero Producao — `parsero-prod-20261022`](https://console.cloud.google.com/home/dashboard?project=parsero-prod-20261022) |
| Homologação | [Parsero Homologacao — `parsero-staging-20261022`](https://console.cloud.google.com/home/dashboard?project=parsero-staging-20261022) |
| API | Cloud Run, serviço `longbeach-api`, região `southamerica-east1` |
| Banco de produção | Cloud SQL, instância `parsero-production-postgres`, database `longbeach` |
| Site estático | Firebase Hosting, site `parsero-prod-20261022` |

API e PostgreSQL ficam em São Paulo. O banco tem principal e reserva em zonas diferentes, 1 CPU, 4 GiB de memória e SSD inicial de 20 GiB com crescimento automático. Produção e homologação são separadas. Cada futura aplicação terá database, usuário, permissões e segredos próprios; **LavaMais e Danielli ainda não foram migrados**. A administração humana não é a identidade usada pela aplicação.

Senhas e chaves ficam no Secret Manager e nos canais privados de operação, nunca neste documento. A conexão ao Cloud SQL exige conector autenticado e permissões PostgreSQL; não há rede universal autorizada para acesso direto ao banco.

Para usar o sistema, abrir o endereço habitual do LongBeach e entrar com a conta Google já utilizada na aplicação. Para administrar infraestrutura, usar a conta Parsero nos projetos acima; o acesso administrativo não substitui o login e as permissões do LongBeach.

## O que já foi concluído nesta janela

- O domínio web foi ativado no Firebase. A versão `d42e47a2c8189591`, release `1792899369037000`, é um clone do mesmo artefato aprovado: **75 hashes de arquivos e configuração idênticos**, sem nova compilação ou envio de conteúdo. A conferência canônica recebeu HTTP 200 nos 75 caminhos; os 73 arquivos comuns e o HTML principal foram conferidos. Os demais registros DNS foram preservados.
- A origem foi congelada e seus consumidores foram drenados e parados antes da cópia final. O backup final foi transferido para armazenamento privado neste Mac e para um bucket privado do Google em São Paulo, com tamanho e SHA-256 conferidos, inclusive após novo download. Essas cópias são temporárias da migração e não substituem a retenção regular do Cloud SQL.
- A cópia final foi restaurada e reconciliada: **59 tabelas, 13.007 linhas, 26 migrations e 99 totais numéricos**, com conteúdo e sequências conferidos. A reconciliação também verificou proprietários e permissões.
- Seis definições de `CHECK` apresentaram somente uma representação diferente de dez conversões de arrays `varchar` para `text`. A equivalência foi conferida por SQL somente leitura no PostgreSQL do destino, com 570 comparações de `ANY`, controles de `NULL` e 85 casos das expressões completas. Nenhuma divergência foi encontrada. A aceitação ficou restrita aos seis pares de definições identificados por hash; não houve alteração das constraints nem normalização geral do schema. As evidências originais foram preservadas.
- A troca dos nomes no Google concluiu o checkpoint B: o database canônico `longbeach` passou a ter **OID 24760**. O candidato anterior, **OID 16568**, foi preservado como `longbeach_candidato_20261025_0340`. Nesse checkpoint ambos estavam sem sessões e com conexões bloqueadas; o recibo ainda registrava runtime e workers desativados. O banco arquivado é o candidato anterior, não uma cópia atualizada de futuras operações.
- O runtime foi liberado no novo database, com permissões conferidas. As 26 migrations coincidem com a imagem aprovada, sem pendências nem execução adicional do job. A prova física identificou conexões da API ao **OID 24760**, sem sessões no banco arquivado. A sonda HTTPS privada concluiu 20 respostas consecutivas de prontidão, verificou CORS e exigência de autenticação própria; não executou lançamentos nem login Google.
- O plano Terraform posterior à troca foi aplicado com sucesso às 01h15: concedeu exclusivamente invocação pública ao serviço pelo balanceador. Não alterou banco, segredos, imagem ou workers. O login da aplicação continua obrigatório.
- A primeira sonda pública, conectando diretamente ao balanceador com o nome e certificado canônicos, recebeu prontidão HTTP 200 e `auth/me` HTTP 401 sem token IAM nem sessão LongBeach. Isso comprova esse caminho público e a proteção de autenticação, mas não a transferência do DNS nem o login completo no navegador.
- Após autorização para dois salvamentos no Registro.br, o DNS da API foi transferido para o Google e conferido nos dois servidores autoritativos, no Google DNS e no acesso padrão deste Mac. A zona final mantém 25 registros e preserva os outros 24. O acesso padrão por HTTPS à prontidão da API retornou HTTP 200 no Google.
- As rotinas foram ativadas no Google às **02h11**, mantendo a origem congelada e parada. O plano alterou somente `BackgroundJobs__Enabled=false` para `true`; a revisão **`longbeach-api-00003-gnv`** ficou `Ready`, recebendo 100% do tráfego, com a mesma imagem aprovada. Migrations, seeds e bootstrap de proprietários no startup continuam desligados.
- A prévia Terraform final, com as variáveis privadas exatas que refletem a promoção pública e os workers ativos, concluiu às **02h13** com **zero mudanças e zero drift**. A conferência não aplicou alterações nem modificou as variáveis.
- No Chrome normal, perfil Gustavo, o login Google retornou HTTP 200, três renovações de sessão retornaram HTTP 200 e a saída retornou HTTP 204 na revisão `longbeach-api-00003-gnv`. A interface de proprietário carregou a agenda com aulas e mensalistas reais de 19 a 25/10, caixa fechado sem erro, recebimentos e equipe. Não foram feitos lançamentos fictícios de negócio.
- Um refresh inicial HTTP 400 foi preservado nas evidências, junto dos três refreshes posteriores HTTP 200. Não foi determinada a causa daquele primeiro erro; os sucessos posteriores não apagam esse registro.
- Os logs das rotinas registraram HTTP 200 em consultas GET de quatro feeds EDI reais. Isso comprova as consultas externas observadas, não a gravação ou conciliação posterior no banco.

A imagem usada no corte da migração foi a do commit `a5117c625caa662f64bb2359d39ba7b7a05327bd`, digest `sha256:a9358fea0263d451d8395c051eacd91522bf70fc7567a45116f8e43965fed2a7`. O Financeiro não fez parte desse corte; foi publicado depois em [promoção separada](financeiro-google-cloud-2026-10-25.md), que registra a imagem vigente.

## Conferência de encerramento

| Etapa | Situação neste registro |
| --- | --- |
| Liberar o runtime no novo database e conferir as 26 migrations, sem execução concorrente | Concluído; nenhuma migration pendente ou job adicional |
| Conferir prontidão HTTPS privada e comprovar conexões da API ao OID 24760 | Concluído; 20 respostas de prontidão e prova física SQL |
| Aplicar a invocação pública revisada, preservando o login LongBeach | Aplicação concluída às 01h15; sonda pública recebeu prontidão 200 e autenticação 401 |
| Transferir e conferir o DNS público da API no Google | Concluído após autorização dos dois salvamentos; autoritativos, Google DNS e acesso padrão do Mac conferidos |
| Ativar as rotinas no Google, mantendo as da origem paradas | Concluído às 02h11; revisão `00003-gnv` pronta com 100% do tráfego |
| Conferir login, renovação de sessão, agenda, caixa e saída após o corte público | Concluído no Chrome normal: login 200, três refreshes 200, logout 204; telas reais carregadas |
| Confirmar backup gerenciado posterior à cópia final | Concluído; backup final em São Paulo `SUCCESSFUL` às 01h23 |
| Encerrar acessos temporários de migração e entregar seu resultado | Concluído; chave própria removida, autorização Railway CLI revogada no servidor e credenciais locais removidas |

As etapas da migração e sua conferência estão concluídas. Manter o acompanhamento da operação e não apagar os recursos preservados do Railway durante a estabilização.

As variáveis privadas refletem a invocação pública, a conferência do corte, os workers ativos no Google e a parada confirmada da origem. O bloqueio anterior da substituição CNAME por A foi resolvido com os dois salvamentos autorizados.

A chave SSH criada para esta operação foi revogada e seu arquivo privado removido; as três chaves anteriores foram preservadas. A autorização do aplicativo Railway CLI foi revogada na conta QuebraNunca: o aplicativo deixou a lista de autorizações, e `railway whoami` retornou `Unauthorized`, saída 1. Essa revogação abrange o aplicativo nessa conta, portanto outros usos do Railway CLI com ela precisam de novo login. A autorização do ChatGPT e a sessão do navegador foram preservadas.

Separadamente, foram removidos apenas os quatro campos de credencial da configuração local do Railway CLI, preservando o identificador do usuário e todos os bytes externos ao objeto de usuário, inclusive vínculos e preferências. A limpeza local não foi usada como prova de revogação; a conferência no servidor foi registrada à parte. A autorização do Google Cloud SDK permanece intencionalmente em configuração local privada para administração da infraestrutura, fora do código.

## Estabilização e publicações posteriores

Acompanhar erros e reinícios no Cloud Run, execução das rotinas, sucesso dos backups, armazenamento e faturamento. Revalidar os fluxos usados no dia a dia com operações reais autorizadas. Os testes realizados não comprovam capacidade sustentada para três clientes, recuperação real por PITR ou todas as integrações de pagamento. A mudança de provedor não ativa integrações bancárias que estavam desligadas.

O Financeiro — despesas, pagamentos da equipe e reembolsos aos sócios — foi publicado em [etapa separada](financeiro-google-cloud-2026-10-25.md) após este corte. LavaMais e Danielli continuam exigindo migrações próprias e não estão incluídos como concluídos nesta entrega.

## Custos e acompanhamento

O Console exibiu os valores abaixo para **1 a 24 de outubro de 2026**, abrangendo os dois projetos, na consulta feita em 25/10. São valores observados, sujeitos ao atraso de consolidação do faturamento.

| Item | Valor observado |
| --- | ---: |
| Cloud SQL | R$ 88,43 |
| Cloud Run | R$ 26,96 |
| Rede | R$ 7,95 |
| Consumo total | **R$ 123,34** |
| Créditos/descontos exibidos | **−R$ 123,34** |
| Total líquido exibido | **R$ 0,00** |

Esse período contém preparação e ensaios, não um mês de operação estável. O Google ainda informou histórico insuficiente para prever o mês; não extrapolar esses valores como mensalidade. O crédito reduz o valor cobrado enquanto disponível, mas não elimina o consumo. O balanceador, tráfego, banco de reserva e homologação também entram no acompanhamento.

O orçamento de referência é **R$ 1.500 por mês**, com alertas em 50%, 80% e 100%, sem descontar créditos da base de consumo. **Os alertas não param os serviços nem limitam a cobrança.** Conferir consumo e créditos no faturamento da conta Parsero; preservar a redundância do banco enquanto se avalia o uso real antes de reduzir recursos ou contratar compromisso anual.

## Backups e recuperação

O Cloud SQL está configurado com backups diários e recuperação pontual dos últimos sete dias. A restauração gerenciada já foi ensaiada em homologação; uma recuperação pontual real por PITR não foi validada. Conferir regularmente o sucesso dos backups, a retenção e o espaço, sem confundir os backups gerenciados com o bucket temporário da migração ou com o bucket de estado Terraform.

Os backups diários estão configurados em São Paulo. O backup manual final **1792902111528** foi confirmado `SUCCESSFUL`, localização `southamerica-east1`, em 25/10 às **01h23min22s**. Nesta janela, uma cópia manual extra (**1792901691454**) foi solicitada sem localização explícita e foi criada em `us`. Essa duplicata criada pela própria migração foi removida depois de conferir a cópia final posterior em São Paulo. A operação de remoção terminou sem erro; o backup final e os outros quatro backups anteriores foram preservados, assim como a cópia lógica privada e a origem Railway. Os próximos backups manuais devem sempre informar a localização de São Paulo explicitamente.

Em caso de incidente, registrar o horário e conter as gravações e rotinas antes de decidir o retorno. Preservar os bancos e evidências; fazer a restauração em destino isolado e conferir conteúdo, sequências, migrations e permissões antes de promovê-la. Seguir o [procedimento técnico de recuperação](google-cloud.md), com um único operador coordenando migrations e workers.

**Depois de novos lançamentos no Google, voltar ao Railway ou ao banco arquivado exige reconciliar esses lançamentos.** Alterar somente o DNS não devolve os dados, e ligar as duas origens pode duplicar rotinas. O banco OID 16568 e a origem congelada devem permanecer preservados até a estabilização e o aceite; sua existência não autoriza retorno automático após novas gravações.

Os recibos de transferência, reconciliação, equivalência SQL, troca de nomes e planos revisados ficam nos artefatos privados da operação. Dumps, credenciais, chaves, dados pessoais e conteúdo de negócio não devem ser anexados ao Git ou ao relatório de entrega.
