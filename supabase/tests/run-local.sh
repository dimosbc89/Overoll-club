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

# Seed check: a fresh database gets the migrations and every brand's seed twice
# (each must be safe to re-run), then each brand's counts must match data/<brand>/*.json.
# All brands share this one test database, which also proves the seeds stay apart.
$psql_cmd -c "create database seed_check" >/dev/null
seed_cmd="env PGOPTIONS=-cclient_min_messages=warning psql -X -q -h $sock -p $port -U postgres -d seed_check -v ON_ERROR_STOP=1"
$seed_cmd -f "$here/supabase-stub.sql"
for f in "$root"/supabase/migrations/*.sql; do $seed_cmd -f "$f"; done
brands=()
for f in "$root"/supabase/seed/*.sql; do
  brand="$(basename "$f" .sql)"
  brands+=("$brand")
  echo "seed: supabase/seed/$brand.sql"
  $seed_cmd -f "$f"
  $seed_cmd -f "$f"
done
for brand in "${brands[@]}"; do
  brand_data="$root/data/$brand"
  want_stores=$(node -e "console.log(require('$brand_data/stores.json').stores.length)")
  want_rewards=$(node -e "console.log(require('$brand_data/rewards.json').rewards.length)")
  got=$($seed_cmd -At -c "select (select count(*) from public.brands where slug = '$brand') || ' ' || (select count(*) from public.stores s join public.brands b on b.id = s.brand_id where b.slug = '$brand') || ' ' || (select count(*) from public.rewards r join public.brands b on b.id = r.brand_id where b.slug = '$brand')")
  if [ "$got" != "1 $want_stores $want_rewards" ]; then
    echo "SEED CHECK FAILED ($brand): brands/stores/rewards = $got, expected 1 $want_stores $want_rewards"; exit 1
  fi
  welcome_reward=$(node -e "console.log(require('$brand_data/rewards.json').welcome_reward.reward)")
  want_welcome=$(node -e "const r=require('$brand_data/rewards.json'); console.log(r.rewards.find(x => x.id === r.welcome_reward.reward).name_en)")
  got_welcome=$($seed_cmd -At -c "select r.name_en from public.brands b join public.rewards r on r.id = (b.config #>> '{welcome,rewardId}')::uuid and r.brand_id = b.id where b.slug = '$brand'")
  if [ "$got_welcome" != "$want_welcome" ]; then
    echo "SEED CHECK FAILED ($brand): welcome reward = '$got_welcome', expected '$want_welcome' ($welcome_reward)"; exit 1
  fi
  got_en=$($seed_cmd -At -c "select count(*) from public.stores s join public.brands b on b.id = s.brand_id where b.slug = '$brand' and s.name_en is not null and s.address_en is not null")
  if [ "$got_en" != "$want_stores" ]; then
    echo "SEED CHECK FAILED ($brand): $got_en of $want_stores stores have an English name and address"; exit 1
  fi
  echo "SEED OK ($brand): $want_stores stores (English names too), $want_rewards rewards, welcome gift: $want_welcome"
done
