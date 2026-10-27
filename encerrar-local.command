#!/bin/bash
# Encerra somente os serviços locais desta cópia do Long Beach OS.
set -euo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$PROJECT_DIR"
export PATH="$HOME/.local/bin:$HOME/.docker/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
DATABASE_CONTAINER=longbeach-perfis-test
ERRORS=0

process_cwd() { lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true; }
process_command() { ps -p "$1" -o command= 2>/dev/null || true; }
process_start() { ps -p "$1" -o lstart= 2>/dev/null || true; }
stop_owned() {
  local pid=$1 label=$2 started=$3 command=$4
  [[ "$(process_start "$pid")" == "$started" && "$(process_command "$pid")" == "$command" ]] || return 0
  printf 'Encerrando %s...\n' "$label"
  kill -TERM "$pid" 2>/dev/null || true
  for ((attempt=0; attempt<20; attempt++)); do
    [[ "$(process_start "$pid")" != "$started" ]] && return 0
    sleep 0.5
  done
  printf 'Não foi possível encerrar %s. Confira a janela correspondente.\n' "$label" >&2
  ERRORS=1
}

printf '\nLong Beach OS — encerrar ambiente local\n\n'
for dependency in lsof ps sed; do
  command -v "$dependency" >/dev/null 2>&1 || { printf 'Ferramenta ausente: %s\n' "$dependency"; exit 1; }
done

# Iniciadores registrados por esta cópia. Não executar arquivos de estado como shell.
for state in "$PROJECT_DIR"/.runtime.local/execucao.*/iniciador.pid; do
  [[ -f "$state" ]] || continue
  IFS= read -r pid <"$state"
  [[ "$pid" =~ ^[0-9]+$ && -f "${state%.pid}.inicio" ]] || continue
  started="$(cat "${state%.pid}.inicio")"
  [[ -n "$started" && "$(process_start "$pid")" == "$started" && "$(process_cwd "$pid")" == "$PROJECT_DIR" ]] || continue
  command="$(process_command "$pid")"
  case "$command" in
    *bash*iniciar-local.command*) stop_owned "$pid" 'iniciador' "$started" "$command" ;;
  esac
done

# Também reconhece a execução anterior à introdução do registro do iniciador.
for port in 5320 5321; do
  for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u || true); do
    cwd="$(process_cwd "$pid")"
    command="$(process_command "$pid")"
    owned=false
    if [[ "$port" == 5320 && "$cwd" == "$PROJECT_DIR/backend/src/LongBeach.Api" && "$command" == *dotnet*LongBeach.Api.dll* ]]; then owned=true; fi
    if [[ "$port" == 5321 && "$cwd" == "$PROJECT_DIR/frontend" && "$command" == *node*node_modules/vite/bin/vite.js* ]]; then owned=true; fi
    if [[ "$owned" == true ]]; then
      stop_owned "$pid" "serviço da porta $port" "$(process_start "$pid")" "$command"
    else
      printf 'Porta %s pertence a outro processo; foi preservado.\n' "$port" >&2
      ERRORS=1
    fi
  done
done

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker container inspect "$DATABASE_CONTAINER" >/dev/null 2>&1; then
    label="$(docker inspect --format '{{index .Config.Labels "com.longbeach.environment"}}' "$DATABASE_CONTAINER")"
    if [[ "$label" == homologacao-local ]]; then
      printf 'Parando banco local, sem apagar os dados...\n'
      docker stop --timeout 20 "$DATABASE_CONTAINER" >/dev/null || ERRORS=1
    else
      printf 'Banco sem identificação de homologação local; foi preservado.\n' >&2
      ERRORS=1
    fi
  fi
fi

if [[ "$ERRORS" == 0 ]]; then
  printf '\nServiços do LongBeach encerrados. Os dados do banco foram preservados.\n'
else
  printf '\nEncerramento parcial. Confira as mensagens acima.\n' >&2
fi
printf 'Docker Desktop e navegador continuam abertos para preservar outros projetos e abas.\n'
exit "$ERRORS"
