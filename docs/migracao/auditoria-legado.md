# Auditoria do sistema atual e classificação do legado

- **Data-base:** 2026-10-01
- **Escopo:** arquivos em `/Users/gustavo-drager/longbeach`, histórico desta conversa, publicação Sites/D1 e publicação Railway descrita e validada durante o trabalho
- **Regra:** nenhum ativo listado aqui deve ser apagado até o aceite do substituto, reconciliação dos dados e encerramento formal da janela de rollback

## Diagnóstico executivo

O que hoje é chamado de sistema Long Beach combina quatro níveis diferentes:

1. **Protótipos e artefatos de trabalho:** capturas, pacotes exportados e scripts usados para construir e verificar o painel.
2. **Site estático:** HTML, CSS e JavaScript que apresentam dados históricos embutidos no arquivo `dist/data.js`.
3. **Dashboard manual:** visões de alunos e financeiro derivadas de duas planilhas, com avisos de que os números ainda exigem conciliação.
4. **Aplicação transacional inicial:** pequenas APIs para complemento cadastral de aluno, funcionários, projetos e estoque, executadas em Node e persistidas em SQLite/D1.

O conjunto é útil e deve ser preservado como referência funcional e fonte de migração. Ele não é a arquitetura final do Long Beach OS: não existe PostgreSQL, identidade individual, papéis, autorização fina, refresh token, trilha de auditoria, API versionada, PWA/Capacitor, isolamento completo de ambientes ou pipeline de produto. O painel mistura dados históricos congelados com registros transacionais, o que impede tratá-lo como fonte única sem reconciliação.

## Inventário verificado

### Sites e deploys

| Item | Evidência | Natureza atual | Classificação | Destino |
|---|---|---|---|---|
| **Long Beach Arena · Gestão** em Sites | `project_id: appgprj_6abe623504b48191a1954624cfda6d5b`; configuração local `.openai/hosting.json`; publicação histórica `long-beach-arena-gestao.gustavodrager.chatgpt.site` | site/dashboard publicado com binding D1 `DB` | **Preservar** durante a transição | fallback e referência visual; retirar somente depois do aceite e retenção definidos |
| Produção Railway atual | projeto `long-beach-arena`, serviço `app`, domínio `longbeach.quebranunca.com.br`, volume montado em `/data` | aplicação Node + arquivos estáticos + SQLite persistente | **Preservar** durante a transição | continua operando enquanto o standalone é validado; serviço, volume e dados permanecem preservados depois da transferência do domínio |
| Domínio web oficial | `longbeach.quebranunca.com.br` | aponta atualmente para o legado; será o endereço da web standalone | **Migrar** | transferir ao novo serviço somente após smoke tests pelos domínios técnicos e com retorno ao legado ensaiado |
| Domínio de API oficial | `api.longbeach.quebranunca.com.br` | não compõe a aplicação legada | **Adaptar** | associar exclusivamente à API standalone depois de health check e TLS validados |
| Domínio técnico Railway do legado | domínio gerado pelo provedor | acesso direto ao serviço atual | **Preservar** | validar antes do corte e manter como acesso ao legado durante a janela de rollback |
| Produção Railway standalone | projeto próprio `longbeach-os`, serviços web/API e PostgreSQL exclusivos | nova aplicação transacional | **Preservar** | publicar e validar em paralelo, sem referências de runtime ao projeto legado ou à Plataforma QuebraNunca |
| Domínios canônicos standalone | `longbeach.quebranunca.com.br` e `api.longbeach.quebranunca.com.br` | web e API da nova produção | **Migrar** | usar o namespace DNS existente sem criar domínio ou zona novos; o compartilhamento é administrativo e não conecta runtimes |

### Código e repositórios

| Item | Estado encontrado | Natureza atual | Classificação | Motivo e ação |
|---|---|---|---|---|
| `dashboard/` | repositório Git local, branch `main`, sem remote configurado; commits do protótipo e deploy | base do sistema atual | **Preservar** | congelar como legado, registrar tag/commit de corte e evitar novas funções após a nova base assumir |
| `dashboard/dist/index.html` | página única com estilos e scripts inline | site estático | **Adaptar** | reaproveitar hierarquia, conteúdo, estados vazios e linguagem no design system React |
| `dashboard/dist/theme.css` | tema responsivo Long Beach/QuebraNunca usado no protótipo | identidade visual | **Adaptar** | converter cores, espaçamento e componentes aprovados em tokens; confirmar contraste e identidade oficial |
| `dashboard/dist/data.js` | aproximadamente 66 KB, 59 identificadores de aluno e séries históricas embutidas | snapshot manual/analítico | **Migrar** | importar via staging com origem, hash, competência e relatório de conflitos; não copiar como código |
| `dashboard/dist/details.js` | detalhes de aluno: telefone, nascimento, endereço, camiseta, bermuda e indicador de aula | componente e fluxo transacional inicial | **Adaptar** | transformar em feature React e endpoints .NET com autorização, validação e auditoria |
| `dashboard/dist/operations.js` | funcionários, regra de pagamento, projetos, estoque e movimentações | componentes e fluxos transacionais iniciais | **Adaptar** | preservar comportamento validado; repartir por features e contratos tipados |
| `dashboard/operations-api.mjs` | endpoints sem versão para staff, projects, inventory e movements | API Node inicial | **Substituir** | reimplementar casos de uso na API .NET; usar o comportamento como oráculo de regressão |
| `dashboard/worker.mjs` | roteamento/handlers para estáticos e operações | runtime Sites/Worker | **Substituir** | frontend estático/CDN e API .NET terão deploys próprios |
| `dashboard/server.mjs` | servidor Node para Railway, login/sessão compartilhados e proxy para worker | runtime provisório | **Substituir** | manter no legado agora; retirar somente após futura migração operacional aceita, quando a identidade própria já estiver validada |
| `dashboard/db/schema.ts` e `dashboard/drizzle/*.sql` | schema SQLite/Drizzle | migrations provisórias | **Migrar** | mapear conceitos e dados; migrations EF Core novas são a única fonte do schema standalone |
| `dashboard/db/railway-sqlite.mjs` | adaptação D1 para SQLite nativo, migrations e carga inicial | persistência provisória | **Substituir** | PostgreSQL e EF Core; preservar somente como ferramenta de exportação durante migração |
| `dashboard/test/*.mjs` | testes de endpoints, persistência, login e validações | regressão do legado | **Adaptar** | converter cenários críticos em testes unitários, integração e end-to-end do novo sistema |
| `dashboard/build.mjs`, `package.json`, `railway.json` | build e deploy Node 24 | toolchain legado | **Descartar depois** | manter enquanto o legado estiver acessível e durante a retenção posterior; não incorporar ao novo runtime |
| `longbeach-os/` | repositório Git próprio criado para a nova arquitetura | produto standalone | **Preservar** | passa a ser o repositório oficial do Long Beach OS |

### Bancos e dados

| Item | Conteúdo conhecido | Natureza atual | Classificação | Tratamento |
|---|---|---|---|---|
| D1 do projeto Sites, binding `DB` | tabelas operacionais do protótipo | banco da publicação anterior | **Preservar** até exportação | exportar, contar linhas, hashear arquivo e reconciliar com Railway antes de decidir a fonte |
| SQLite Railway `/data/longbeach.sqlite` | `student_details`, `staff`, `projects`, `inventory_items`, `stock_movements` | banco transacional atual | **Migrar** | exportação consistente, staging no PostgreSQL, relatório por tabela e aceite humano |
| Registro de funcionário | Marcos, função de bar e limpeza, confirmado no corte anterior | dado transacional | **Migrar** | importar com identificador de origem e revisão dos campos pendentes |
| Detalhes de alunos | telefone, nascimento, endereço, tamanhos e situação de aula quando preenchidos | dados pessoais | **Migrar** | restringir acesso, minimizar, auditar e validar consentimento/base operacional |
| Estoque e movimentações | itens, mínimo e histórico quando cadastrados | dados transacionais | **Migrar** | manter ordem e sinal das movimentações; reconciliar saldo calculado por item |
| Projetos | título, status, responsável, prazo e observações quando cadastrados | dados transacionais | **Migrar** | mapear para Tasks/Projects sem perder status e timestamp de origem |
| `outputs/Controle-Long-Beach-Outubro-2026.xlsx` | planilha consolidada produzida no trabalho | artefato de controle | **Preservar** | guardar como fonte datada e candidata a uma importação rastreável |
| planilhas Google de financeiro e aulas | links no rodapé do painel; origem informada como Pedro e Vitor | fontes manuais | **Preservar** | capturar versões imutáveis, permissões e data de extração; importar por lote |
| `work/fonte-0.xlsx`, `work/fonte-1.xlsx`, `work/dados.json` | fontes e extrações usadas na montagem | material de migração | **Preservar** | catalogar, remover cópias desnecessárias só após retenção e comparação de hashes |

### Páginas e funções

| Página/função | Estado | Classificação | Observação de migração |
|---|---|---|---|
| Visão geral | indicadores de setembro/agosto e pendências de fechamento | **Adaptar** | manter mensagens de qualidade do dado; recalcular a partir do PostgreSQL |
| Financeiro | receitas/despesas por mês e fotografia de caixa | **Adaptar** | separar competência, caixa, origem e conciliação; números congelados viram lote histórico |
| Alunos e possíveis retornos | histórico, busca, filtros e 59 nomes distintos | **Adaptar** | deduplicar apelidos, criar identidade de pessoa e estados explícitos |
| Detalhe do aluno | complemento cadastral editável | **Migrar** | preservar campos úteis com validação, permissão e auditoria |
| Funcionários | função, contato, status e regra de pagamento | **Migrar** | modelar pessoa/colaborador e remuneração com vigência, sem sobrescrever histórico |
| Planejamento | projetos em quadro por status | **Adaptar** | incorporar ao módulo Tasks, mantendo o fluxo simples inicialmente |
| Estoque | cadastro, mínimo, entrada, saída e contagem | **Adaptar** | usar razão de movimentações, idempotência e auditoria; bar/PDV comercial fica para depois |
| Login atual | um usuário/senha de arena, cookie HMAC de 8 horas e compatibilidade Basic | **Substituir** | contas individuais, senha hash, JWT curto, refresh rotativo, revogação e papéis |
| Health check atual | `/health` testa acesso ao SQLite | **Adaptar** | separar liveness e readiness; readiness verifica PostgreSQL sem expor detalhes |

### Documentação e conhecimento de negócio

| Item | Classificação | Tratamento |
|---|---|---|
| `LongBeach_OS_Arquitetura_Standalone_v0.2.md` | **Preservar** | cópia controlada em `docs/arquitetura`; referência normativa |
| documentos `00-` a `10-` na pasta Long Beach | **Preservar** | conhecimento de operação, marca, escola, financeiro, governança e parcerias; revisar antes de virar regra de sistema |
| `dashboard/RAILWAY.md` | **Adaptar** | conservar como runbook do legado; o runbook standalone deve descrever projeto e PostgreSQL próprios, transferência controlada do domínio web e retorno ao endereço técnico legado |
| `work/*.tar.gz`, previews e scripts de patch | **Descartar depois** | úteis para reprodução/auditoria agora; limpar somente após tag, backup e aceite do novo produto |

## Modelo físico atual

O schema transacional verificado possui:

- `student_details`: um complemento por identificador legado de aluno;
- `staff`: cadastro e regra corrente de pagamento;
- `projects`: planejamento simples;
- `inventory_items`: item, categoria, unidade e mínimo;
- `stock_movements`: razão de entrada, saída, contagem e saldo inicial.

Os dados analíticos de alunos, mensalidades, custos, aluguéis e saldos não estão normalizados nesse banco: são carregados no JavaScript do frontend. Portanto, exportar apenas SQLite ou D1 não produz uma migração completa.

## Estado de produção conhecido

Durante a publicação anterior do legado foram validados o health check, a proteção de acesso, a página principal, a API de funcionários e a persistência após reinício. Naquele momento havia um registro de funcionário (Marcos) e as demais tabelas operacionais estavam vazias. Esse retrato deve ser reconfirmado na data da exportação, pois o sistema permaneceu acessível e pode ter recebido alterações.

As alterações da tela de login por formulário e da sessão foram preservadas no commit legado `3509287` (`Preserve deployed form login`) e marcadas localmente com a tag `legacy-baseline-2026-10-01`. O único arquivo não rastreado restante no repositório legado é `.DS_Store`, sem efeito no sistema. Esse baseline não deve receber funções novas; durante a transição, mudanças nele ficam restritas à continuidade do serviço.

## Lacunas que impedem considerar o legado como aplicação final

- identidade individual, recuperação de conta e MFA ausentes;
- papéis e permissões por operação ausentes;
- auditoria de antes/depois, ator, IP e correlação ausente;
- séries históricas importantes embutidas no frontend;
- schemas D1/SQLite e Railway podem divergir sem reconciliação;
- nenhuma API pública versionada ou OpenAPI;
- ausência de PostgreSQL, EF Core e migrations oficiais;
- ausência de frontend React/TypeScript, PWA e Capacitor;
- ambientes Development, Test, Staging e Production não estão isolados como produto;
- observabilidade, política de backup e restauração ainda não foram demonstradas ponta a ponta;
- credencial compartilhada impede atribuir ações a uma pessoa;
- dados pessoais exigem minimização, acesso restrito e política de retenção.

## Regra de preservação

Até o encerramento da transição, toda mudança no legado deve ser mínima e voltada à continuidade. Não excluir projeto Sites, banco D1, serviço Railway, volume SQLite, domínio técnico, planilhas, pacotes ou histórico Git. O novo sistema receberá cópias por exportação; o original permanece intacto para comparação e rollback.
