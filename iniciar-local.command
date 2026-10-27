#!/bin/bash
# Pode ser executado pelo Terminal ou com dois cliques no Finder do macOS.
set -euo pipefail
umask 077

PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$PROJECT_DIR"
export PATH="$HOME/.local/bin:$HOME/.docker/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
# O Finder pode abrir o Terminal sem carregar o PATH personalizado do usuário.
if ! command -v pnpm >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  NODE_BIN="$(node -p 'require("node:path").dirname(process.execPath)')"
  export PATH="$NODE_BIN:$PATH"
fi
CONFIG="${LONGBEACH_LOCAL_ENV:-$PROJECT_DIR/../dados-locais/configuracao/longbeach-local.env}"
DATABASE_CONTAINER=longbeach-perfis-test
API_URL=http://localhost:5320
WEB_URL=http://localhost:5321
API_PID=''
WEB_PID=''

fail() { printf '\nErro: %s\n' "$*" >&2; exit 1; }
cleanup() {
  local result=$?
  trap - EXIT INT TERM
  for child in "$WEB_PID" "$API_PID"; do
    if [[ -n "$child" ]] && kill -0 "$child" 2>/dev/null; then
      kill "$child" 2>/dev/null || true
    fi
  done
  for child in "$WEB_PID" "$API_PID"; do
    if [[ -n "$child" ]]; then wait "$child" 2>/dev/null || true; fi
  done
  printf '\nAPI e interface desta execução encerradas. O banco foi preservado.\n'
  if [[ $result -ne 0 && -t 0 ]]; then
    read -r -p 'Pressione Enter para fechar...' _ || true
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 0' INT TERM

printf '\nLong Beach OS — ambiente local\n\n'
for dependency in docker dotnet node pnpm curl lsof; do
  command -v "$dependency" >/dev/null 2>&1 || fail "Instale $dependency antes de continuar. Requisitos: Docker Desktop, .NET 10, Node.js 24 e pnpm."
done
[[ -f "$CONFIG" ]] || fail 'Configuração local não encontrada em dados-locais/configuracao/longbeach-local.env. Consulte docs/operacao/estrutura-local.md.'
for port in 5320 5321; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "A porta $port já está em uso. Feche a execução anterior antes de iniciar novamente."
  fi
done

# Carregar os segredos somente nos processos da API, nunca na interface.
api_environment() {
  # Ler como dotenv, não como comandos shell: a conexão contém ponto e vírgula.
  local env_key env_value
  while IFS= read -r -d '' env_key && IFS= read -r -d '' env_value; do
    export "$env_key=$env_value"
  done < <(node - "$CONFIG" <<'NODE'
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
for (const [key, value] of Object.entries(parseEnv(readFileSync(process.argv[2], 'utf8')))) {
  process.stdout.write(key + '\0' + value + '\0');
}
NODE
  )
  [[ "${ASPNETCORE_ENVIRONMENT:-}" == Staging ]] || fail 'O arquivo local deve usar ASPNETCORE_ENVIRONMENT=Staging.'
  [[ "${ASPNETCORE_URLS:-}" == "$API_URL" ]] || fail 'A API local deve escutar somente em http://localhost:5320.'
  case ";${ConnectionStrings__LongBeach:-};" in
    *';Host=localhost;'*|*';Host=127.0.0.1;'*) ;;
    *) fail 'O banco configurado não está em localhost.' ;;
  esac
  case ";${ConnectionStrings__LongBeach:-};" in
    *';Database=longbeach_profiles_preview;'*) ;;
    *) fail 'Use exclusivamente o banco local longbeach_profiles_preview.' ;;
  esac
  case ";${ConnectionStrings__LongBeach:-};" in
    *';Port=55439;'*) ;;
    *) fail 'O banco de homologação deve usar a porta local 55439.' ;;
  esac
  export DOTNET_ENVIRONMENT=Staging
  export Database__MigrateOnStartup=false Authorization__SeedOnStartup=false BackgroundJobs__Enabled=false
  export Bootstrap__InitialOwner__Enabled=false
}
(api_environment)

mkdir -p "$PROJECT_DIR/.runtime.local"
RUN_DIR="$(mktemp -d "$PROJECT_DIR/.runtime.local/execucao.XXXXXX")"
printf '%s\n' "$$" >"$RUN_DIR/iniciador.pid"
ps -p "$$" -o lstart= >"$RUN_DIR/iniciador.inicio"
printf 'Registros desta execução: %s\n\n' "$RUN_DIR"

if ! docker info >/dev/null 2>&1; then
  [[ "$(uname -s)" == Darwin ]] || fail 'Inicie o Docker e execute novamente.'
  printf 'Abrindo Docker Desktop...\n'
  open -a Docker || fail 'Não foi possível abrir o Docker Desktop.'
  for ((attempt=0; attempt<60; attempt++)); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  docker info >/dev/null 2>&1 || fail 'O Docker não ficou pronto em dois minutos.'
fi
docker container inspect "$DATABASE_CONTAINER" >/dev/null 2>&1 || fail "O banco existente ($DATABASE_CONTAINER) não foi encontrado. Nenhum banco foi criado ou substituído."
printf 'Iniciando banco local...\n'
docker start "$DATABASE_CONTAINER" >"$RUN_DIR/banco.log" 2>&1 || fail "Confira $RUN_DIR/banco.log"
DB_READY=false
for ((attempt=0; attempt<30; attempt++)); do
  if docker exec "$DATABASE_CONTAINER" sh -c 'pg_isready -U "$POSTGRES_USER" -d longbeach_profiles_preview' >/dev/null 2>&1; then
    DB_READY=true; break
  fi
  sleep 2
done
[[ "$DB_READY" == true ]] || fail 'O PostgreSQL não ficou pronto em um minuto.'

printf 'Conferindo schema local, sem aplicar migrations...\n'
node "$PROJECT_DIR/scripts/check-local-schema.mjs" "$CONFIG" "$DATABASE_CONTAINER" >"$RUN_DIR/schema.log" 2>&1 || fail "A prévia precisa de conferência antes de iniciar esta versão. Nenhuma migration foi aplicada. Confira $RUN_DIR/schema.log e docs/operacao/estrutura-local.md."

printf 'Preparando dependências da interface...\n'
(cd "$PROJECT_DIR/frontend"; COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile) >"$RUN_DIR/dependencias.log" 2>&1 || fail "Confira $RUN_DIR/dependencias.log"
printf 'Compilando API...\n'
(cd "$PROJECT_DIR/backend"; dotnet build src/LongBeach.Api/LongBeach.Api.csproj -m:1 -p:UseSharedCompilation=false) >"$RUN_DIR/build-api.log" 2>&1 || fail "Confira $RUN_DIR/build-api.log"

wait_http() {
  local url=$1 child=$2 label=$3
  for ((attempt=0; attempt<60; attempt++)); do
    kill -0 "$child" 2>/dev/null || fail "$label encerrou antes de ficar pronto. Confira os registros em $RUN_DIR."
    if curl --noproxy '*' --fail --silent --max-time 2 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  fail "$label não respondeu. Confira os registros em $RUN_DIR."
}

printf 'Iniciando API...\n'
(api_environment; cd "$PROJECT_DIR/backend/src/LongBeach.Api"; exec dotnet bin/Debug/net10.0/LongBeach.Api.dll) >"$RUN_DIR/api.log" 2>&1 &
API_PID=$!
wait_http "$API_URL/health/ready" "$API_PID" API

printf 'Iniciando interface...\n'
(
  cd "$PROJECT_DIR/frontend"
  export VITE_API_URL="$API_URL" VITE_DEMO_MODE=false VITE_OPERATIONAL_STORAGE=postgres
  exec node node_modules/vite/bin/vite.js --host localhost --port 5321 --strictPort
) >"$RUN_DIR/frontend.log" 2>&1 &
WEB_PID=$!
wait_http "$WEB_URL" "$WEB_PID" Interface

printf '\nPronto! Abra %s e entre pelo Google.\nAPI: %s\n\nMantenha esta janela aberta. Ctrl+C encerra a API e a interface.\nPara encerrar também o banco, abra encerrar-local.command.\n' "$WEB_URL" "$API_URL"
if [[ "$(uname -s)" == Darwin && "${LONGBEACH_OPEN_BROWSER:-true}" != false ]]; then open "$WEB_URL" || true; fi
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do sleep 2; done
fail "Um dos serviços encerrou. Confira os registros em $RUN_DIR."
