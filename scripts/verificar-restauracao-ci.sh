#!/bin/sh
# Only the disposable CI service: never use production credentials or a real dump.
set -eu
if [ "${POSTGRES_DB:-}" != longbeach_ci ] || [ "${POSTGRES_USER:-}" != longbeach_ci ]; then
  echo 'This check requires the disposable longbeach_ci PostgreSQL service.' >&2
  exit 2
fi
export PGUSER=longbeach_ci
export PGDATABASE=longbeach_ci
unset PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The application migration/readiness step has completed; no app worker is running.
pg_dump --format=custom --no-owner --no-acl --file="$work/backup.dump"
# Fail if it already exists; never overwrite or drop a pre-existing database.
createdb longbeach_restore_check
pg_restore --exit-on-error --no-owner --no-acl --dbname=longbeach_restore_check "$work/backup.dump"

# Hash all public-table rows in deterministic order, including migrations and ledgers.
psql -X -qAt -v ON_ERROR_STOP=1 > "$work/fingerprint.sql" <<'SQL'
SELECT format(
  'SELECT %L, count(*), md5(coalesce(string_agg(row_to_json(t)::text, E''\n'' ORDER BY row_to_json(t)::text), '''')) FROM %I.%I t;',
  tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
SQL
psql -X -qAt -v ON_ERROR_STOP=1 -f "$work/fingerprint.sql" > "$work/source.txt"
PGDATABASE=longbeach_restore_check psql -X -qAt -v ON_ERROR_STOP=1 -f "$work/fingerprint.sql" > "$work/restored.txt"
test -s "$work/source.txt"
diff -u "$work/source.txt" "$work/restored.txt"
echo 'Synthetic restore verified: all public tables, row counts and content hashes match.'
echo 'This is not evidence of a production backup or production RPO/RTO.'
