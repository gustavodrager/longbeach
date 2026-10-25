#!/usr/bin/env bash
# Creates only the explicitly supplied projects and their billing association.
source "$(cd "$(dirname "$0")" && pwd)/common.sh"
parse_apply "$@"
require_value GCP_PRODUCTION_PROJECT_ID
require_value GCP_STAGING_PROJECT_ID
require_value GCP_BILLING_ACCOUNT_ID
validate_project "$GCP_PRODUCTION_PROJECT_ID"
validate_project "$GCP_STAGING_PROJECT_ID"
[[ "$GCP_PRODUCTION_PROJECT_ID" != "$GCP_STAGING_PROJECT_ID" ]] || fail 'Produção e staging precisam de projetos distintos.'
[[ "$GCP_BILLING_ACCOUNT_ID" =~ ^[A-Fa-f0-9]{6}-[A-Fa-f0-9]{6}-[A-Fa-f0-9]{6}$ ]] || fail 'ID de faturamento inválido.'

if [[ "$APPLY" != true ]]; then
  printf 'Prévia: conferir existência e faturamento; criar somente projetos ausentes. Não troca uma conta de faturamento existente.\n'
  for project in "$GCP_PRODUCTION_PROJECT_ID" "$GCP_STAGING_PROJECT_ID"; do
    show_command gcloud projects create "$project" --account="$GOOGLE_ACCOUNT"
    show_command gcloud billing projects link "$project" --billing-account="$GCP_BILLING_ACCOUNT_ID" --account="$GOOGLE_ACCOUNT"
  done
  exit 0
fi

check_account
billing_open="$(gcloud billing accounts describe "$GCP_BILLING_ACCOUNT_ID" --account="$GOOGLE_ACCOUNT" --format='value(open)')"
case "$billing_open" in
  True|true) ;;
  *) fail 'Conta de faturamento fechada ou estado não confirmado. Nenhum projeto foi criado ou associado por esta execução.' ;;
esac
for project in "$GCP_PRODUCTION_PROJECT_ID" "$GCP_STAGING_PROJECT_ID"; do
  if ! gcloud projects describe "$project" --account="$GOOGLE_ACCOUNT" --format='value(projectId)' >/dev/null 2>&1; then
    gcloud projects create "$project" --account="$GOOGLE_ACCOUNT"
  fi
  current_billing="$(gcloud billing projects describe "$project" --account="$GOOGLE_ACCOUNT" --format='value(billingAccountName)')"
  if [[ -n "$current_billing" && "$current_billing" != "billingAccounts/$GCP_BILLING_ACCOUNT_ID" ]]; then
    fail "Projeto $project já pertence a outra conta de faturamento. Nenhuma troca foi feita."
  fi
  if [[ -z "$current_billing" ]]; then
    gcloud billing projects link "$project" --billing-account="$GCP_BILLING_ACCOUNT_ID" --account="$GOOGLE_ACCOUNT"
  fi
  billing_enabled="$(gcloud billing projects describe "$project" --account="$GOOGLE_ACCOUNT" --format='value(billingEnabled)')"
  case "$billing_enabled" in
    True|true) ;;
    *) fail "Faturamento ainda não habilitado no projeto $project. Interrompa o provisionamento." ;;
  esac
done
printf 'Projetos conferidos. APIs e recursos são gerenciados pelo Terraform.\n'
