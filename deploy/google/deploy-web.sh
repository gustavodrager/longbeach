#!/usr/bin/env bash
# Publishes static files only. No domain or API rewrite is configured here.
source "$(cd "$(dirname "$0")" && pwd)/common.sh"
parse_apply "$@"
validate_environment
require_value GCP_FIREBASE_SITE_ID
require_value GCP_WEB_DIST_DIR
require_value VITE_API_URL
[[ "$GCP_FIREBASE_SITE_ID" =~ ^[a-z0-9][a-z0-9-]{3,29}$ ]] || fail 'ID de site Firebase inválido.'
script_dir="$(cd "$(dirname "$0")" && pwd)"
require_tool python3
python3 "$script_dir/web_artifact.py" verify
if [[ "$APPLY" != true ]]; then
  printf 'Prévia: publicar artefato verificado de %s em %s, projeto %s, conta %s. Sem alterar DNS.\n' "$GCP_WEB_DIST_DIR" "$GCP_FIREBASE_SITE_ID" "$GCP_PROJECT_ID" "$GOOGLE_ACCOUNT"
  exit 0
fi
require_tool firebase
config_dir="$(mktemp -d "${TMPDIR:-/tmp}/longbeach-firebase.XXXXXX")"
trap 'rm -rf "$config_dir"' EXIT
python3 - "$script_dir/firebase.json" "$config_dir/firebase.json" "$GCP_FIREBASE_SITE_ID" "$GCP_WEB_DIST_DIR" <<'PY'
import json, sys
source, destination, site, public = sys.argv[1:]
with open(source) as file:
    config = json.load(file)
config['hosting'].pop('target')
config['hosting']['site'] = site
config['hosting']['public'] = public
with open(destination, 'w') as file:
    json.dump(config, file)
PY
firebase deploy --only hosting --config "$config_dir/firebase.json" --project "$GCP_PROJECT_ID" --account "$GOOGLE_ACCOUNT" --non-interactive
