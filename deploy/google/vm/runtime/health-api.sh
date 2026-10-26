#!/bin/bash
set -euo pipefail
# No curl dependency, credentials or response body in health output.
[[ "${API_DOMAIN:-}" =~ ^[a-z0-9.-]+$ ]] || exit 1
exec 3<>/dev/tcp/127.0.0.1/8080
printf 'GET /health/ready HTTP/1.0\r\nHost: %s\r\nConnection: close\r\n\r\n' "$API_DOMAIN" >&3
IFS= read -r -t 5 status <&3
[[ "$status" =~ ^HTTP/1\.[01]\ 200([[:space:]]|$) ]]
