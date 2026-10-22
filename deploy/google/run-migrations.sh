#!/usr/bin/env bash
# Executes an already provisioned job once; does not deploy or change its image.
source "$(cd "$(dirname "$0")" && pwd)/common.sh"
parse_apply "$@"
validate_environment
require_value GCP_MIGRATION_JOB
require_value API_IMAGE_DIGEST
[[ "$GCP_MIGRATION_JOB" =~ ^[a-z][a-z0-9-]*$ ]] || fail 'Nome de job inválido.'
[[ "$API_IMAGE_DIGEST" == "$GOOGLE_REGION-docker.pkg.dev/$GCP_PROJECT_ID/longbeach/"* && "$API_IMAGE_DIGEST" =~ @sha256:[a-f0-9]{64}$ ]] || fail 'API_IMAGE_DIGEST deve apontar ao digest imutável do repositório deste projeto.'
if [[ "$APPLY" == true ]]; then
  check_account
  require_tool python3
  deployed_image="$(gcloud run jobs describe "$GCP_MIGRATION_JOB" --region="$GOOGLE_REGION" --project="$GCP_PROJECT_ID" --account="$GOOGLE_ACCOUNT" --format='value(spec.template.spec.template.spec.containers[0].image)')"
  [[ "$deployed_image" == "$API_IMAGE_DIGEST" ]] || fail 'Imagem do job difere do digest esperado. Não executado.'
  executions_file="$(mktemp "${TMPDIR:-/tmp}/longbeach-migration-executions.XXXXXX")"
  trap 'rm -f "$executions_file"' EXIT
  gcloud run jobs executions list --job="$GCP_MIGRATION_JOB" --region="$GOOGLE_REGION" --project="$GCP_PROJECT_ID" --account="$GOOGLE_ACCOUNT" --format=json > "$executions_file"
  python3 - "$executions_file" <<'PY'
import json, sys
with open(sys.argv[1]) as file:
    executions = json.load(file)
if not isinstance(executions, list):
    raise SystemExit('Resposta de execuções inválida. Nenhuma migration iniciada.')
for execution in executions:
    if not isinstance(execution, dict):
        raise SystemExit('Execução inválida. Nenhuma migration iniciada.')
    status = execution.get('status', execution)
    if not isinstance(status, dict):
        raise SystemExit('Status de execução inválido. Nenhuma migration iniciada.')
    conditions = status.get('conditions', [])
    if not isinstance(conditions, list) or any(not isinstance(item, dict) for item in conditions):
        raise SystemExit('Condições de execução inválidas. Nenhuma migration iniciada.')
    completion_time = status.get('completionTime')
    if completion_time is not None and not isinstance(completion_time, str):
        raise SystemExit('Horário de conclusão inválido. Nenhuma migration iniciada.')
    completed = bool(completion_time) or any(
        item.get('type') == 'Completed' and str(item.get('status')).lower() == 'true'
        for item in conditions
    )
    if not completed:
        raise SystemExit('Existe execução ativa ou sem conclusão comprovada. Nenhuma migration iniciada.')
PY
fi
# This check is not a distributed lock. One approved operator must own this job.
run_command gcloud run jobs execute "$GCP_MIGRATION_JOB" --wait --region="$GOOGLE_REGION" --project="$GCP_PROJECT_ID" --account="$GOOGLE_ACCOUNT"
