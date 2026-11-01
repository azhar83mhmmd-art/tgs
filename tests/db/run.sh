#!/usr/bin/env bash
# Menjalankan seluruh uji database pada Postgres lokal (butuh psql + server Postgres 14+).
# Pemakaian:  PGHOST=/path/socket PGPORT=5433 PGUSER=postgres ./run.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=tugasku_test
P="psql -v ON_ERROR_STOP=1 -q -X -d"
psql -X -d postgres -q -c "drop database if exists $DB" -c "create database $DB"
$P $DB -f 00_supabase_stub.sql
$P $DB -f legacy_schema.sql >/dev/null 2>&1 || true   # pesan 'publication' normal
$P $DB -f 01_legacy_fixture.sql
for run in 1 2; do
  echo "== sql/*.sql (putaran $run: $([ $run = 1 ] && echo migrasi || echo idempotensi)) =="
  for f in ../../sql/[0-9]*.sql; do $P $DB -f "$f"; done
done
echo "== assertions =="
$P $DB -f 02_assertions.sql
echo "SEMUA UJI LULUS"
