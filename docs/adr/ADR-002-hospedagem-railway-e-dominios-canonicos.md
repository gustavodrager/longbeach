# ADR-002 — Hospedagem Railway e domínios canônicos próprios

- **Status:** superseded pelo `ADR-003-dominios-quebranunca-e-isolamento-railway.md`
- **Data da decisão:** 2026-10-01
- **Decisores:** responsáveis pelo produto Long Beach
- **Complementa:** `ADR-001-produto-standalone.md`
- **Substitui parcialmente:** somente as referências anteriores aos domínios de produção do novo produto e qualquer plano de hospedá-lo na Huawei Cloud

> **Registro histórico — não aplicar aos domínios.** A escolha de `longbeach.com.br` e `api.longbeach.com.br` foi revogada antes da publicação. A hospedagem Railway com recursos exclusivos permanece confirmada pelo ADR-003.

## Contexto

O HANDOFF e a arquitetura v0.2 consolidaram a decisão principal: o Long Beach OS é um produto standalone e não pode depender da Plataforma QuebraNunca. Naquele momento, os endereços previstos para o novo produto eram subdomínios de `quebranunca.com.br`.

Depois dessa decisão, a direção operacional foi atualizada. A nova produção será publicada no Railway, usando a conta administrativa já disponível, mas em projeto e recursos exclusivos do Long Beach OS. A web passa a usar o domínio próprio `longbeach.com.br` e a API, `api.longbeach.com.br`.

O serviço Node/SQLite já publicado em `longbeach.quebranunca.com.br` continua sendo o sistema legado. Seu domínio, serviço, volume e dados permanecem intactos enquanto a nova base é implantada e validada. A publicação nos novos domínios não constitui migração de dados, corte operacional nem autorização para desligar o legado.

## Decisão

1. A produção standalone será hospedada no Railway em um projeto exclusivo, denominado `longbeach-os` ou equivalente inequívoco.
2. O projeto terá serviços próprios para web e API, PostgreSQL próprio, variáveis e secrets próprios, logs próprios e demais recursos operacionais próprios.
3. Os domínios canônicos de Production são:
   - web: `https://longbeach.com.br`;
   - API: `https://api.longbeach.com.br`.
4. O workspace ou a conta administrativa do Railway pode ser o mesmo usado para administrar outros produtos. Essa conveniência não autoriza referência de variável, conexão de banco, volume, secret, serviço, domínio interno ou permissão de runtime entre eles.
5. `https://longbeach.quebranunca.com.br` continua apontando para o sistema legado. Ele não será reapontado, redirecionado ou removido durante a primeira publicação standalone.
6. O domínio legado não será usado como fallback por troca de DNS dos novos domínios. Em caso de falha da nova produção, o rollback restaura as revisões dos serviços standalone; a operação legada continua disponível em seu endereço próprio.
7. Uma futura migração de dados ou mudança da fonte oficial de escrita exige plano, reconciliação, janela, responsáveis e autorização separados. O aceite técnico da nova infraestrutura, sozinho, não satisfaz essa porta de decisão.

## Limites de isolamento no Railway

- projeto e ambientes exclusivos do Long Beach OS;
- serviços `longbeach-web` e `longbeach-api` independentes do serviço legado;
- PostgreSQL sem banco, usuário ou conexão compartilhados;
- nenhuma variável de referência para serviços da Plataforma QuebraNunca ou do projeto legado;
- chaves JWT, cookies, CORS e credenciais exclusivas por ambiente;
- migrations executadas por job único e controlado do Long Beach OS;
- acesso administrativo por contas individuais e revisão periódica das permissões do workspace;
- custos, logs, backups, alertas e restauração identificáveis por produto.

## Consequências

### Benefícios

- o endereço público e a identidade operacional do produto deixam de depender do domínio da QuebraNunca;
- a nova produção pode ser validada sem alterar o serviço que sustenta a operação atual;
- o mesmo provedor simplifica a administração sem introduzir dependência de runtime;
- a reversibilidade aumenta porque legado e standalone usam domínios e recursos diferentes.

### Custos e responsabilidades

- manter dois sistemas acessíveis durante a transição;
- governar permissões do workspace compartilhado para impedir acesso cruzado acidental;
- pagar e monitorar recursos próprios de API, web e PostgreSQL;
- comunicar claramente qual ambiente é legado, qual é validação e, no futuro, qual é a fonte oficial de escrita.

## Relação com documentos anteriores

As cópias `HANDOFF_LongBeach_OS_Standalone_para_Work.md` e `LongBeach_OS_Arquitetura_Standalone_v0.2.md` permanecem preservadas como registros autoritativos da decisão de independência e do desenho original. Quando elas citam `longbeach.quebranunca.com.br`, `api.longbeach.quebranunca.com.br` ou outro provedor para a nova produção, este ADR registra a decisão posterior aplicável à execução.

Todas as demais restrições desses documentos e do ADR-001 continuam vigentes, especialmente a proibição de compartilhar código, banco, API, autenticação, frontend, migrations, storage, secrets ou deploy com a Plataforma QuebraNunca.
