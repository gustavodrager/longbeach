#!/usr/bin/env bash
# Secret bytes are read from a private file, never an argument or shell variable.
source "$(cd "$(dirname "$0")" && pwd)/common.sh"
[[ $# -ge 2 ]] || fail 'Uso: upload-secret.sh SECRET_ID ARQUIVO_PRIVADO [--apply]'
secret_id="$1"
secret_file="$2"
shift 2
parse_apply "$@"
validate_environment
[[ "$secret_id" =~ ^longbeach-[a-z0-9-]+$ ]] || fail 'Use um secret exclusivo com prefixo longbeach-.'
require_tool python3
python3 - "$secret_file" <<'PY'
import os, stat, sys
path = sys.argv[1]
s = os.lstat(path)
if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_mode & 0o077 or s.st_size == 0:
    raise SystemExit('Arquivo deve ser regular, não vazio, do usuário atual e privado (0600 ou 0400).')
PY
if [[ "$APPLY" == true ]]; then check_account; fi
run_command gcloud secrets versions add "$secret_id" --data-file="$secret_file" --project="$GCP_PROJECT_ID" --account="$GOOGLE_ACCOUNT"
printf 'Use o número da versão retornada no Terraform. Não use latest; remova a cópia temporária após conferir.\n'
