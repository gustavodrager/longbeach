#!/usr/bin/env bash
# Helpers only. No cloud command runs when this file is sourced.
set -euo pipefail
set +x
umask 077

readonly GOOGLE_ACCOUNT='parserotech@gmail.com'
readonly GOOGLE_REGION='southamerica-east1'

fail() { printf '%s\n' "$*" >&2; exit 1; }
require_value() { [[ -n "${!1:-}" ]] || fail "Defina $1 antes de continuar."; }
require_tool() { command -v "$1" >/dev/null 2>&1 || fail "Ferramenta ausente: $1"; }
validate_project() { [[ "$1" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || fail 'ID de projeto inválido.'; }
validate_environment() {
  require_value GCP_ENVIRONMENT
  [[ "$GCP_ENVIRONMENT" == production || "$GCP_ENVIRONMENT" == staging ]] || fail 'GCP_ENVIRONMENT deve ser production ou staging.'
  require_value GCP_PROJECT_ID
  validate_project "$GCP_PROJECT_ID"
}
parse_apply() {
  APPLY=false
  if [[ "${1:-}" == --apply ]]; then APPLY=true; shift; fi
  [[ $# == 0 ]] || fail 'Argumento inesperado. Use somente --apply para executar.'
}
show_command() { printf '  '; printf '%q ' "$@"; printf '\n'; }
run_command() {
  show_command "$@"
  if [[ "$APPLY" == true ]]; then "$@"; fi
}
check_account() {
  require_tool gcloud
  local credential
  credential="$(gcloud auth list --filter="account=$GOOGLE_ACCOUNT" --format='value(account)')"
  [[ "$credential" == "$GOOGLE_ACCOUNT" ]] || fail "Autentique $GOOGLE_ACCOUNT pelo fluxo oficial do Google antes de executar."
}
