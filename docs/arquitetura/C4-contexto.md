# C4 — Contexto do Long Beach OS

## Escopo

O Long Beach OS é o sistema próprio da arena para escola, agenda, grupos, operação financeira, infraestrutura, tarefas, arquivos, notificações, importações e indicadores. A Plataforma QuebraNunca não está dentro do limite do sistema e não é necessária para nenhum fluxo.

```mermaid
C4Context
    title Long Beach OS — Diagrama de contexto

    Person(owner, "Sócio / administrador", "Acompanha a arena, aprova ações e administra acessos")
    Person(manager, "Gestor", "Executa a operação diária, agenda, cobranças, tarefas e manutenção")
    Person(teacher, "Professor", "Consulta aulas, faz chamada e registra ocorrências")
    Person(student, "Aluno", "Consulta agenda, matrícula, pagamentos e notificações")
    Person(auditor, "Auditor / suporte autorizado", "Consulta evidências, logs e trilhas conforme permissão")

    System(lb, "Long Beach OS", "Produto standalone para a operação web e mobile da Long Beach Arena")

    System_Ext(email, "Provedor de e-mail", "Entrega mensagens transacionais")
    System_Ext(push, "Apple/Google Push", "Entrega notificações aos aplicativos")
    System_Ext(stores, "App Store / Google Play", "Distribui os aplicativos oficiais")

    Rel(owner, lb, "Administra e acompanha", "HTTPS")
    Rel(manager, lb, "Opera", "HTTPS")
    Rel(teacher, lb, "Registra aulas e presença", "HTTPS")
    Rel(student, lb, "Consulta e interage", "HTTPS")
    Rel(auditor, lb, "Audita conforme permissão", "HTTPS")
    Rel(lb, email, "Solicita envio de e-mails", "API segura")
    Rel(lb, push, "Solicita notificações push", "API segura")
    Rel(stores, student, "Distribui aplicativo")
    Rel(stores, teacher, "Distribui aplicativo")
    Rel(stores, manager, "Distribui aplicativo")
```

## Fronteira com a QuebraNunca

O Long Beach OS de Production é publicado em `longbeach.quebranunca.com.br` e `api.longbeach.quebranunca.com.br`. O namespace DNS e a conta administrativa do Railway podem ser compartilhados com outros produtos, mas projeto, serviços, banco, secrets, logs, migrations, autenticação e deploy são exclusivos do Long Beach OS, conforme o ADR-003.

Durante a transição, o dashboard legado permanece em serviço separado. Antes do corte, ele continua atendendo o endereço web oficial enquanto a base standalone é validada pelos domínios técnicos do Railway. Depois do corte, o legado continua acessível por seu endereço técnico durante a janela de retorno, sem conexão de runtime com a nova aplicação.

Uma integração futura com a Plataforma QuebraNunca poderá ser adicionada como sistema externo por OAuth 2.0/OpenID Connect ou API versionada, com consentimento e disponibilidade opcional. Ela não pode virar requisito para login, leitura ou escrita dos dados da Long Beach.

## Fluxos prioritários

- Sócios e gestores administram usuários, arena e operação.
- Professores consultam suas aulas e registram chamada.
- Alunos consultam agenda, situação da matrícula e pagamentos.
- Alterações críticas geram evento de auditoria no próprio Long Beach OS.
- Notificações saem por adapters; a indisponibilidade do canal não invalida a transação de negócio.
