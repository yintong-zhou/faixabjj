#!/usr/bin/env bash
# Replays the whole migration history into a throwaway Postgres, twice, the way
# a preview branch replays "pending" migrations. The first file is skipped on
# the second pass on purpose: 20260910000000 cannot run over a migrated
# database (see docs/claude/database.md, "Known limits").
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=faixabjj-replay
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres postgres:17-alpine >/dev/null

# The image's init phase runs a temporary server on the socket only; waiting on
# TCP skips it.
until docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do sleep 1; done

run() {
  docker exec -i "$NAME" psql -h 127.0.0.1 -U postgres -q -v ON_ERROR_STOP=1 -f - < "$1"
}

run tests/supabase-stub.sql

for pass in $(seq 1 "${PASSES:-2}"); do
  for f in migrations/*.sql; do
    if [ "$pass" = 2 ] && [ "$(basename "$f")" = "20260910000000_init_schema.sql" ]; then
      continue
    fi
    echo "pass $pass: $(basename "$f")"
    run "$f"
  done
done

if [ "${1:-}" = "--isolation" ]; then
  echo "isolation tests"
  run tests/tenant-isolation.sql
fi

echo "OK"
[ "${KEEP:-}" = "1" ] || docker rm -f "$NAME" >/dev/null
