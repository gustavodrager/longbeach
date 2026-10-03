# ADR-003 — Domínios QuebraNunca e isolamento no Railway

- **Status:** aceito
- **Data da decisão:** 2026-10-01
- **Decisores:** responsáveis pelo produto Long Beach
- **Complementa:** `ADR-001-produto-standalone.md`
- **Supersede:** a escolha de domínios raiz registrada no ADR-002

## Contexto

O ADR-001 definiu o Long Beach OS como produto standalone. O ADR-002 registrou temporariamente a intenção de publicar a web em `longbeach.com.br` e a API em `api.longbeach.com.br`. Essa escolha foi revogada antes da publicação: não haverá registro de `longbeach.com.br`, nova zona DNS nem nova conta Cloudflare para este trabalho.

A decisão final usa a conta Railway e o namespace DNS de `quebranunca.com.br` que já são administrados pela equipe. Compartilhar conta de fornecedor e namespace DNS reduz trabalho administrativo, mas não muda a fronteira do produto. O Long Beach OS continua com código, dados, identidade, deploy e operação próprios.

O dashboard Node/SQLite legado ocupa hoje `longbeach.quebranunca.com.br`. Por isso, a base standalone deve ser validada por endereços técnicos do Railway antes da transferência controlada do domínio web oficial. O serviço, o volume e os dados do legado permanecem preservados e acessíveis por seu endereço técnico durante a janela de retorno.

## Decisão

1. A produção standalone será hospedada no Railway em projeto exclusivo, denominado `longbeach-os` ou equivalente inequívoco.
2. Os endereços oficiais são:
   - web: `https://longbeach.quebranunca.com.br`;
   - API: `https://api.longbeach.quebranunca.com.br`.
3. Não será registrado nem usado o domínio `longbeach.com.br` e não será criada uma nova zona ou conta Cloudflare.
4. O projeto Railway do Long Beach OS terá serviços web e API, PostgreSQL, variáveis, secrets, logs, backups e configurações de deploy próprios.
5. O workspace ou a conta administrativa do Railway pode ser compartilhado com outros produtos. Nenhum serviço do Long Beach OS poderá referenciar banco, volume, variável, secret, domínio interno ou serviço da Plataforma QuebraNunca ou do projeto legado.
6. O uso de `quebranunca.com.br` é uma delegação administrativa de DNS. Ele não implica código compartilhado, login único, cookies de autenticação compartilhados, banco comum, API obrigatória, pipeline conjunto ou coordenação de releases.
7. Antes do corte, builds e health checks serão validados nos domínios técnicos gerados pelo Railway. A API poderá receber o domínio oficial depois desses checks. O fluxo web completo de cookie/CORS será ensaiado por um subdomínio temporário de preview sob `longbeach.quebranunca.com.br`, removido após o corte, ou dentro da janela controlada com retorno imediato disponível. A web só receberá o domínio oficial após o substituto passar pelos critérios de aceite.
8. No corte, `longbeach.quebranunca.com.br` será removido do serviço legado e associado ao serviço web standalone. O serviço legado, seu volume e seu endereço técnico Railway serão mantidos para retorno.
9. Falha nos critérios de corte exige reverter o domínio web ao serviço legado e preservar as transações confirmadas no novo sistema para reconciliação. Nenhum dado ou recurso legado será apagado como parte desse procedimento.
10. Migração de dados e mudança da fonte oficial de escrita continuam exigindo reconciliação, janela e autorização específicas; a configuração do domínio, isoladamente, não concede esse aceite.

## Limites de cookies e identidade

- o refresh token web permanece em cookie `HttpOnly` restrito ao host da API;
- o cookie anti-CSRF legível pelo frontend usa `Domain=longbeach.quebranunca.com.br`, o menor domínio comum entre a web e `api.longbeach.quebranunca.com.br`;
- nenhum cookie do Long Beach OS usa `Domain=quebranunca.com.br`, evitando exposição desnecessária a outros subdomínios;
- usuários, hashes de senha, papéis, permissões e sessões pertencem exclusivamente ao PostgreSQL do Long Beach OS;
- a autenticação do legado e qualquer autenticação da Plataforma QuebraNunca permanecem separadas.

## Consequências

### Benefícios

- preserva os endereços já escolhidos e reconhecidos para a arena;
- evita registrar e operar um novo domínio e uma nova zona DNS;
- reutiliza a administração existente do Railway sem compartilhar runtime;
- mantém uma rota reversível porque o serviço legado não é removido no corte.

### Custos e responsabilidades

- a troca do domínio web exige uma janela controlada, pois legado e standalone não podem atendê-lo ao mesmo tempo;
- permissões do workspace Railway e da zona DNS precisam ser revisadas para evitar mudanças cruzadas acidentais;
- a equipe deve manter e testar o endereço técnico do legado enquanto durar a janela de rollback;
- documentação e comunicação precisam distinguir claramente compartilhamento administrativo de dependência técnica.

## Relação com documentos anteriores

As cópias `HANDOFF_LongBeach_OS_Standalone_para_Work.md` e `LongBeach_OS_Arquitetura_Standalone_v0.2.md` permanecem preservadas integralmente. Seus domínios previstos coincidem com esta decisão final e suas restrições de independência continuam obrigatórias.

O ADR-002 permanece no repositório como registro da decisão intermediária. Suas referências a `longbeach.com.br`, `api.longbeach.com.br`, nova zona DNS ou publicação paralela em domínio raiz não devem ser aplicadas. A escolha do Railway e os limites de isolamento ali descritos são reafirmados por este ADR.
