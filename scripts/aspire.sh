#!/usr/bin/env bash
# Push the .dagger otel-dump NDJSON traces into a .NET Aspire dashboard via
# OTLP/HTTP. The Aspire dashboard's OTLP/JSON parser reads span ids as hex —
# like Jaeger v2 — but wants status.code as an int, so the converter runs
# with --aspire. Target the dashboard's OTLP/HTTP port (default :18890 in
# aspire-dashboard 13.x; earlier builds used :4318).
# Usage: devbox run aspire   (or: bash scripts/aspire.sh [dump-dir] [endpoint])
#   [dump-dir]            dir with the *.ndjson dumps (default ./otel-dump)
#   [endpoint]            dashboard OTLP/HTTP base URL (default
#                         http://localhost:18890, override with
#                         ASPIRE_OTLP_ENDPOINT)
set -e

DUMP_DIR="${1:-${DUMP_DIR:-./otel-dump}}"
ENDPOINT="${2:-${ASPIRE_OTLP_ENDPOINT:-http://localhost:18890}}"

node scripts/traces-to-otlp.mjs "$DUMP_DIR" --aspire |
  curl -fsS -X POST "$ENDPOINT/v1/traces" \
    -H 'Content-Type: application/json' --data-binary @-

echo "traces pushed to Aspire dashboard OTLP — open http://localhost:18888 (login token is printed by the dashboard at startup)"