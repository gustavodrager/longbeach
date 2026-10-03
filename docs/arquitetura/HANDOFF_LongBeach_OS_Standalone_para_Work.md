# HANDOFF — Long Beach OS Standalone para Work

> **Proveniência desta cópia:** transcrição operacional recuperada da mensagem autoritativa enviada pelo usuário nesta conversa em 01/10/2026. Ela não se apresenta como exportação técnica do arquivo original da Biblioteca. Deve ser comparada ao original quando ele estiver disponível; até lá, o texto abaixo é a instrução autoritativa para esta execução porque foi fornecido diretamente pelo usuário.

## Transcrição recuperada

Continue o desenvolvimento do sistema desta conversa, mas atualize a direção do projeto para a nova arquitetura oficial do Long Beach OS.

Leia integralmente na minha Biblioteca os arquivos:

`/Long Beach OS/HANDOFF_LongBeach_OS_Standalone_para_Work.md`

`/Long Beach OS/LongBeach_OS_Arquitetura_Standalone_v0.2.md`

Use o arquivo HANDOFF como instrução autoritativa para esta execução. Ele substitui qualquer plano anterior que colocava a Long Beach dentro da Plataforma QuebraNunca.

A decisão atual é:

- Long Beach OS será um produto standalone;
- repositório próprio;
- solução .NET própria;
- frontend React/TypeScript/Vite próprio;
- banco PostgreSQL próprio;
- autenticação própria;
- deploy, storage, logs e auditoria próprios;
- PWA e Capacitor para aplicativos iOS e Android;
- domínio web `longbeach.quebranunca.com.br`;
- API `api.longbeach.quebranunca.com.br`;
- nenhuma dependência de código, banco, API, autenticação, frontend, migrations, storage ou deploy da Plataforma QuebraNunca.

Antes de alterar qualquer coisa:

1. audite tudo que já existe nesta conversa;
2. identifique site, código, repositório, banco, páginas, componentes, dados, deploy e documentação;
3. diferencie protótipo, site estático, dashboard manual e aplicação transacional;
4. classifique cada item como Preservar, Adaptar, Migrar, Substituir ou Descartar depois;
5. preserve todo trabalho útil;
6. não apague o sistema atual sem substituto validado;
7. apresente o diagnóstico e o plano de transição;
8. depois siga com o bootstrap standalone de forma incremental, testável e reversível.

Considere também, caso seja o sistema desta conversa, o site existente:

Long Beach Arena · Gestão
`project_id: appgprj_6abe623504b48191a1954624cfda6d5b`

O sistema atual deve continuar acessível enquanto a nova base standalone é estruturada.

Após a auditoria, siga com:

- ADR-001 registrando Long Beach como produto independente;
- diagramas C4 de contexto e contêineres;
- estrutura do monorepo `longbeach-os`;
- `LongBeach.sln`;
- camadas Api, Application, Domain, Infrastructure e Contracts;
- frontend React/TypeScript/Vite;
- PWA;
- Capacitor;
- PostgreSQL próprio;
- autenticação JWT e refresh token;
- papéis e permissões;
- auditoria;
- health checks;
- testes;
- CI/CD;
- ambientes Development, Test, Staging e Production.

Não volte ao plano antigo de integração interna com a Plataforma QuebraNunca.

No final, informe:

- diagnóstico do sistema atual;
- o que foi preservado;
- o que será migrado;
- estrutura criada;
- arquivos alterados;
- testes executados;
- deploy ou ambientes configurados;
- riscos;
- pendências;
- próximos passos.

## Aplicação nesta execução

Em caso de conflito, esta direção prevalece sobre decisões anteriores da conversa. O sistema atual deve permanecer operacional em paralelo. A arquitetura oficial copiada em `LongBeach_OS_Arquitetura_Standalone_v0.2.md` detalha a decisão; este handoff define a ordem e as salvaguardas da transição.
