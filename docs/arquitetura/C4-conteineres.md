# C4 — Contêineres do Long Beach OS

```mermaid
C4Container
    title Long Beach OS — Diagrama de contêineres

    Person(user, "Usuário", "Sócio, administrador, gestor, professor ou aluno")

    System_Boundary(lb, "Long Beach OS") {
        Container(web, "Web / PWA", "React, TypeScript, Vite", "Interface responsiva; mantém access token em memória e usa refresh protegido")
        Container(mobile, "Aplicativos iOS e Android", "React, TypeScript, Capacitor", "Interface mobile, secure storage, câmera, deep links, push e fila local progressiva")
        Container(api, "API", ".NET 10, ASP.NET Core", "Monólito modular: identidade, arena, pessoas, escola, agenda, grupos, financeiro operacional, infraestrutura, tarefas, arquivos, notificações, auditoria, importações e dashboard")
        Container(worker, "Processamento em segundo plano", ".NET Hosted Services", "Processa outbox, notificações, importações e tarefas idempotentes")
        ContainerDb(db, "PostgreSQL", "PostgreSQL", "Dados transacionais, identidade própria, refresh tokens hash, auditoria e outbox")
        ContainerDb(files, "Object storage", "Storage exclusivo", "Fotos, comprovantes e arquivos; banco guarda somente metadados e referências")
        Container(logs, "Logs e observabilidade", "Serviço exclusivo", "Logs estruturados, métricas, traces e alertas por ambiente")
    }

    System_Ext(mail, "Provedor de e-mail", "Mensagens transacionais")
    System_Ext(push, "APNs / FCM", "Notificações push")

    Rel(user, web, "Usa", "HTTPS")
    Rel(user, mobile, "Usa", "Aplicativo nativo")
    Rel(web, api, "Consome", "HTTPS/JSON /api/v1")
    Rel(mobile, api, "Consome e sincroniza", "HTTPS/JSON /api/v1")
    Rel(api, db, "Lê e grava", "TLS/PostgreSQL")
    Rel(api, files, "Gera URL e registra arquivos", "HTTPS")
    Rel(api, logs, "Publica telemetria sem dados sensíveis", "TLS")
    Rel(api, worker, "Registra trabalho via outbox", "PostgreSQL")
    Rel(worker, db, "Reserva e confirma trabalho", "TLS/PostgreSQL")
    Rel(worker, files, "Processa arquivos quando necessário", "HTTPS")
    Rel(worker, mail, "Envia", "API segura")
    Rel(worker, push, "Envia", "API segura")
    Rel(worker, logs, "Publica telemetria", "TLS")
```

## Regras entre contêineres

- Web e mobile nunca acessam PostgreSQL, storage ou providers diretamente com credenciais privilegiadas.
- A API é a autoridade de autenticação, autorização e regras de negócio.
- Arquivos são enviados com URLs curtas e escopo restrito; a confirmação passa pela API.
- O worker pode iniciar dentro do processo da API na primeira fase, mas seu contrato lógico e suas tarefas são idempotentes.
- Falhas em e-mail ou push permanecem na outbox para nova tentativa e não revertem uma transação já confirmada.
- Logs, banco, storage e secrets são exclusivos por ambiente.

## Implantação de Production

- `longbeach-web` publica a Web/PWA no Railway e, depois do corte validado, atende `https://longbeach.quebranunca.com.br`.
- `longbeach-api` publica a API no Railway e atende `https://api.longbeach.quebranunca.com.br`.
- o PostgreSQL é um recurso exclusivo do projeto standalone e só aceita conexões dos serviços autorizados desse projeto;
- worker, object storage e observabilidade permanecem limites lógicos próprios, mesmo quando a primeira release executa o worker no processo da API ou usa serviços gerenciados do provedor;
- nenhum contêiner referencia serviço, banco, volume, secret ou domínio interno da Plataforma QuebraNunca ou do projeto Railway legado;
- antes do corte, o legado atende `longbeach.quebranunca.com.br`; depois, permanece fora desta fronteira e acessível por seu domínio técnico Railway durante a janela de retorno;
- compartilhar o namespace DNS e a conta Railway é uma conveniência administrativa e não cria dependência de código, dados, autenticação, API ou deploy.
