# ADR-001 — Long Beach OS como produto independente

- **Status:** aceito
- **Data da decisão:** 2026-10-01
- **Decisores:** responsáveis pelo produto Long Beach
- **Fonte de autoridade:** `docs/arquitetura/HANDOFF_LongBeach_OS_Standalone_para_Work.md`
- **Substitui:** qualquer plano que trate a Long Beach como módulo interno da Plataforma QuebraNunca
- **Complementado por:** `ADR-003-dominios-quebranunca-e-isolamento-railway.md`, que registra a decisão operacional vigente de domínio e hospedagem

## Contexto

O trabalho anterior produziu um painel útil para leitura dos controles recebidos e algumas operações simples. Esse painel foi publicado em `longbeach.quebranunca.com.br`, porém sua arquitetura é de transição: frontend estático em JavaScript, rotas HTTP em Node, SQLite e uma credencial compartilhada. Existe também uma publicação anterior em Sites/D1. Nenhuma dessas bases atende, por si só, aos requisitos de produto, segurança, evolução web/mobile, rastreabilidade e independência definidos para o Long Beach OS.

O uso inicial de um subdomínio de `quebranunca.com.br` não deve criar acoplamento técnico ou patrimonial com a Plataforma QuebraNunca. A Long Beach precisa poder evoluir, operar, migrar de fornecedor, integrar-se ou ser transferida sem depender do código ou dos dados de outro produto.

## Decisão

O Long Beach OS será construído e operado como produto **standalone**, com:

- repositório e histórico de versões próprios;
- solução .NET própria, em monólito modular;
- backend ASP.NET Core em .NET 10 LTS, separado nas camadas Api, Application, Domain, Infrastructure e Contracts;
- frontend próprio em React, TypeScript e Vite;
- PWA e aplicativos iOS/Android empacotados com Capacitor;
- PostgreSQL, migrations, usuários, autenticação, autorização e auditoria próprios;
- storage, secrets, logs, backups, CI/CD e deploy próprios;
- web em `longbeach.quebranunca.com.br` e API em `api.longbeach.quebranunca.com.br`, conforme o ADR-003;
- ambientes Development, Test, Staging e Production isolados;
- integração futura com outros produtos somente por contratos explícitos e adapters.

O Long Beach OS não terá dependência de código, banco, API, autenticação, frontend, migrations, storage, logs ou deploy da Plataforma QuebraNunca. Não haverá tabelas, credenciais, filas nem recursos de runtime compartilhados como condição de funcionamento.

O monorepo será pequeno. Os módulos lógicos permanecerão organizados por pastas e namespaces nas cinco camadas, sem microserviços ou um projeto .NET por módulo nesta etapa.

## Limites obrigatórios

1. A aplicação deve iniciar e executar seus fluxos principais mesmo que todos os serviços da QuebraNunca estejam indisponíveis.
2. A API só acessa o PostgreSQL e o storage do Long Beach OS.
3. Senhas, refresh tokens e tabelas de usuários nunca serão importados ou sincronizados com a QuebraNunca.
4. Integrações futuras usam HTTP/eventos documentados, consentimento e referências externas opcionais; não usam acesso direto ao banco.
5. Cada ambiente possui recursos e secrets separados. Produção não reutiliza credenciais de Development, Test ou Staging.
6. O schema oficial é controlado por migrations do EF Core deste repositório.
7. O sistema legado continua disponível até existir substituto validado, reconciliação dos dados e plano de retorno testado.

## Alternativas consideradas

### Continuar ampliando o dashboard atual

Rejeitada como arquitetura final. O dashboard é uma referência funcional e uma ponte operacional, mas possui dados analíticos embutidos, banco SQLite, autenticação compartilhada e componentes sem a separação necessária para uma aplicação transacional de longo prazo.

### Criar módulos Long Beach dentro da Plataforma QuebraNunca

Rejeitada. Criaria dependência de ciclo de release, modelo de identidade, banco, infraestrutura e decisões de outro produto, impedindo a independência exigida.

### Adotar microserviços desde a fundação

Rejeitada nesta fase. A complexidade operacional não se justifica para o tamanho atual da equipe e do domínio. O monólito modular mantém limites claros e permite extrações futuras baseadas em evidência.

## Consequências

### Benefícios

- propriedade e evolução independentes;
- modelo de segurança apropriado para usuários web e mobile;
- rastreabilidade por auditoria e migrations;
- caminho direto para PWA, App Store e Google Play;
- rollback e migração de fornecedor sem coordenar releases da QuebraNunca;
- integrações futuras opcionais e substituíveis.

### Custos e responsabilidades

- manter pipeline, banco, backups, observabilidade e gestão de secrets próprios;
- construir autenticação, autorização e recuperação de conta com nível de produção;
- migrar e conciliar dados do painel e das planilhas;
- manter temporariamente o legado e o novo sistema em paralelo;
- gerir publicação e conformidade dos aplicativos móveis.

## Aplicação da decisão ao legado

O código e os dados atuais não serão apagados. Layout, linguagem, identidade visual, conhecimento de domínio, transformações das planilhas e fluxos já validados serão preservados como insumos. Componentes úteis serão reimplementados dentro das convenções novas; dados serão migrados por importação rastreável. A base standalone será validada primeiro pelos domínios técnicos do Railway. A transferência do domínio web oficial para o novo serviço só ocorrerá com substituto validado e rota de retorno testada. Node, SQLite, D1, a credencial compartilhada e o deploy antigo só poderão ser retirados em uma transição futura, após validação, reconciliação e autorização específica.

## Critérios de conformidade

Uma mudança está de acordo com este ADR quando:

- pertence ao repositório `longbeach-os` e respeita as dependências entre camadas;
- não introduz referência de runtime à Plataforma QuebraNunca;
- mantém dados e secrets nos recursos do Long Beach OS;
- possui teste compatível com seu risco e passa no pipeline;
- produz auditoria para operações críticas;
- documenta migrations e impacto de deploy;
- preserva a reversibilidade durante a transição.

Qualquer exceção exige novo ADR, análise de segurança e aprovação explícita dos responsáveis pelo Long Beach OS.
