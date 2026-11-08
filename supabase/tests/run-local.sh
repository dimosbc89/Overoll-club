#!/usr/bin/env bash
# Spin up a throwaway Postgres, apply the Supabase stub + all migrations,
# run the access-rule tests, then delete everything.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
bin="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
data="$(mktemp -d)"
sock="$(mktemp -d)"
port=55432
cleanup() { "$bin/pg_ctl" -D "$data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$data" "$sock"; }
trap cleanup EXIT

if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$data" "$sock"
  run() { su postgres -c "$*"; }
else
  run() { bash -c "$*"; }
fi

run "'$bin/initdb' -D '$data' -A trust -U postgres >/dev/null"
run "'$bin/pg_ctl' -D '$data' -o \"-p $port -k $sock -c listen_addresses=''\" -l '$data/log' start >/dev/null"
psql_cmd="psql -X -q -h $sock -p $port -U postgres -d postgres -v ON_ERROR_STOP=1"

$psql_cmd -f "$here/supabase-stub.sql"
for f in "$root"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  $psql_cmd -f "$f"
done
$psql_cmd -o /dev/null -f "$here/rls.sql" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //"
