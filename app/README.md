# Long Beach OS · App

Frontend standalone da Long Beach Arena em React, TypeScript e Vite. A aplicação mantém access token e token anti-CSRF somente em memória e renova a sessão por refresh token em cookie HTTP-only fornecido pela API. Nenhum token de autenticação é gravado em `localStorage` ou `sessionStorage`.

## Desenvolvimento

1. Copie `.env.example` para `.env` e ajuste `VITE_API_URL`.
2. Execute `pnpm install`.
3. Execute `pnpm dev`.

## Validação

- `pnpm test`: testes da autenticação e do shell protegido.
- `pnpm build`: checagem de tipos e build PWA para produção.

## Aplicativos móveis

- `pnpm mobile:add:android` e `pnpm mobile:add:ios`: criam os projetos nativos uma única vez.
- `pnpm mobile:sync`: gera o frontend e sincroniza os arquivos nativos.
- `pnpm mobile:android` ou `pnpm mobile:ios`: sincroniza e abre o projeto na IDE nativa.

O identificador dos aplicativos é `br.com.longbeacharena.app`.
