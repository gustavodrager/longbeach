# Utilitários da prévia local

Estes quatro programas preservam os preparadores usados nas prévias anteriores.
Cada projeto referencia o backend em `../../backend/src/`; nenhum deles faz parte
do startup da API, do build do frontend ou do deploy.

Os programas alteram dados apenas quando recebem o argumento
`--apply-local-fixtures`. Antes de abrir qualquer conexão, o código compartilhado
em `Shared/LocalPreview.cs` exige `LONG_BEACH_LOCAL_TOOL_DATABASE_URL` e valida a
connection string com `NpgsqlConnectionStringBuilder`: host `localhost` ou
`127.0.0.1`, porta `55439` e database `longbeach_profiles_preview`. Qualquer outro
destino é recusado. O valor segue o formato Npgsql `Host=...;Port=...;Database=...;Username=...;Password=...`.
Configure a credencial local no ambiente da sessão, fora de arquivos versionados.

| Variável | Uso |
| --- | --- |
| `LONG_BEACH_LOCAL_TOOL_DATABASE_URL` | Conexão com o banco fictício local, obrigatória para os quatro programas. |
| `LONG_BEACH_PREVIEW_PASSWORD` | Senha escolhida para os usuários fictícios de `profile-preview-seed` e `google-preview-seed`. |
| `LONG_BEACH_LOCAL_ADMIN_EMAIL` | Conta já existente e verificada por Google no banco local para receber o papel Administrator. |
| `LONG_BEACH_LOCAL_OWNER_EMAIL` | Outra conta já existente e verificada por Google no banco local para receber o papel Owner. |

As fixtures usam endereços sintéticos sob `example.invalid`. As duas variáveis de
email são usadas somente por `google-admin-local`; nenhum email pessoal é
incluído no código.

Prepare uma instância PostgreSQL descartável com esse banco local e configure as
variáveis antes de invocar manualmente os comandos abaixo, a partir de `backend/` para selecionar o SDK fixado:

```sh
dotnet run --project ../tools/profile-preview-seed/Preview.csproj -- --apply-local-fixtures
dotnet run --project ../tools/google-preview-seed/Preview.csproj -- --apply-local-fixtures
dotnet run --project ../tools/billing-preview-seed/Preview.csproj -- --apply-local-fixtures
```

`profile-preview-seed` aplica as migrations locais e cria quatro perfis, agenda e
matrículas fictícias. `google-preview-seed` cria um cliente fictício com subject
Google de demonstração e a senha definida no ambiente. `billing-preview-seed`
depende desses dois preparadores e cria contas e comanda fictícias sem chamar
provedores de pagamento. Os preparadores não limpam um banco prévio e nem todos
são idempotentes; use um banco descartável preparado para esse fim.

O quarto programa atende à inspeção local de papéis e exige as duas contas
Google já existentes, ativas e sem primeiro acesso pendente:

```sh
dotnet run --project ../tools/google-admin-local/Preview.csproj -- --apply-local-fixtures
```

Ele altera papéis, revoga refresh tokens anteriores e registra a invocação local
atual na auditoria. O argumento autoriza somente as fixtures no destino local
validado; não representa autorização para ambiente hospedado.

Para conferir apenas a compilação, sem executar nenhum programa, também dentro de `backend/`:

```sh
dotnet build ../tools/profile-preview-seed/Preview.csproj
dotnet build ../tools/google-preview-seed/Preview.csproj
dotnet build ../tools/billing-preview-seed/Preview.csproj
dotnet build ../tools/google-admin-local/Preview.csproj
```
