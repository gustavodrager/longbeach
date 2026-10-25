#!/usr/bin/env bash
# Builds the verified frontend from a Git archive; never uses the checkout's dist.
source "$(cd "$(dirname "$0")" && pwd)/common.sh"
parse_apply "$@"
validate_environment
require_value GCP_WEB_DIST_DIR
require_value VITE_API_URL
require_tool python3
require_tool git
script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_dir="$(cd "$script_dir/../.." && pwd)"
source_commit="$(python3 "$script_dir/web_artifact.py" source)"
git -C "$repo_dir" cat-file -e "$source_commit:app/package.json"
[[ ! -e "$GCP_WEB_DIST_DIR" && ! -L "$GCP_WEB_DIST_DIR" ]] || fail 'O diretório de saída deve ser novo; nenhum artefato existente será sobrescrito.'
if [[ "$APPLY" != true ]]; then
  printf 'Prévia: extrair frontend %s para temporário privado, instalar dependências fixadas, compilar e salvar em %s. Nenhuma publicação.\n' "$source_commit" "$GCP_WEB_DIST_DIR"
  exit 0
fi
require_tool pnpm
source_dir="$(mktemp -d "${TMPDIR:-/tmp}/longbeach-web-source.XXXXXX")"
trap 'rm -rf "$source_dir"' EXIT
git -C "$repo_dir" archive --format=tar --output="$source_dir/source.tar" "$source_commit" app
mkdir "$source_dir/source"
tar -xf "$source_dir/source.tar" -C "$source_dir/source"
pnpm --dir "$source_dir/source/app" install --frozen-lockfile
VITE_DEMO_MODE=false VITE_OPERATIONAL_STORAGE=postgres VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-}" pnpm --dir "$source_dir/source/app" build
mkdir -m 700 "$GCP_WEB_DIST_DIR"
cp -R "$source_dir/source/app/dist/." "$GCP_WEB_DIST_DIR/"
python3 "$script_dir/web_artifact.py" record
python3 "$script_dir/web_artifact.py" verify
printf 'Frontend verificado: %s. Artefato privado: %s. Nenhuma publicação.\n' "$source_commit" "$GCP_WEB_DIST_DIR"
