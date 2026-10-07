#!/usr/bin/env node
/**
 * Merge the NDJSON trace dumps (auth.ndjson / worker.ndjson / test.ndjson)
 * produced by the .dagger `otel-dump` func into an OTLP/JSON
 * ExportTraceServiceRequest, POSTable to a Jaeger (v2) OTLP endpoint:
 *
 *   dagger call otel-dump --testFile="agent-discovery.test.ts" export --path ./otel-dump
 *   node scripts/traces-to-otlp.mjs ./otel-dump > otel.json
 *   curl -X POST http://localhost:4318/v1/traces \
 *     -H 'Content-Type: application/json' \
 *     --data-binary @otel.json
 *
 * (or pipe: node scripts/traces-to-otlp.mjs ./otel-dump | curl -X POST
 *  http://localhost:4318/v1/traces -H 'Content-Type: application/json'
 *  --data-binary @-)
 *
 * OTLP/JSON spec encodes bytes (traceId/spanId/parentSpanId) as base64, but
 * the Jaeger v2 collector's JSON decoder (`model.ID.UnmarshalJSONIter`)
 * reads them as HEX (32/16 chars) — verified live: base64 ids get
 * `ID.UnmarshalJSONIter: length mismatch`, hex ids get HTTP 200. The .NET
 * Aspire dashboard (13.x, scripts/aspire.sh) turns out to read ids as hex
 * too, but rejects enum-name strings for `kind` and `status.code` (400) — it
 * wants ints. So: default output keeps hex ids + enum-name kind/status
 * (Jaeger v2); pass `--aspire` for hex ids + int kind/status (Aspire 13.x).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Aspire dashboard 13.x: hex ids (like Jaeger), but status.code as an int
// (enum-name strings get 400). Default output targets Jaeger v2.
const aspireMode = process.argv.includes('--aspire')
const dumpDir = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) ?? './otel-dump'

function anyValue(value) {
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { boolValue: value }
  if (typeof value === 'number') {
    // protobuf-JSON int64 is a string; integers stay ints, floats become doubles
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value }
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(anyValue) } }
  }
  if (value !== null && typeof value === 'object') {
    return { stringValue: JSON.stringify(value) }
  }
  return { stringValue: String(value) }
}

function attributesToOtlp(attributes = {}) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({ key, value: anyValue(value) }))
}

const SPAN_KINDS = [
  'SPAN_KIND_UNSPECIFIED',
  'SPAN_KIND_INTERNAL',
  'SPAN_KIND_SERVER',
  'SPAN_KIND_CLIENT',
  'SPAN_KIND_PRODUCER',
  'SPAN_KIND_CONSUMER',
]

const STATUS_CODES = ['STATUS_CODE_UNSET', 'STATUS_CODE_OK', 'STATUS_CODE_ERROR']

const records = []
for (const file of readdirSync(dumpDir).filter((f) => f.endsWith('.ndjson'))) {
  for (const line of readFileSync(join(dumpDir, file), 'utf8').split('\n')) {
    if (line.trim()) records.push(JSON.parse(line))
  }
}

// Group spans by service → one ResourceSpans per service.
const byService = new Map()
for (const span of records) {
  const serviceName = span.serviceName ?? 'unknown'
  if (!byService.has(serviceName)) byService.set(serviceName, [])
  byService.get(serviceName).push(span)
}

const resourceSpans = []
for (const [serviceName, spans] of byService) {
  resourceSpans.push({
    resource: {
      attributes: [{ key: 'service.name', value: { stringValue: serviceName } }],
    },
    scopeSpans: [
      {
        scope: { name: 'sai-otel' },
        spans: spans.map((span) => ({
          traceId: span.traceId,
          spanId: span.spanId,
          ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
          name: span.name,
          kind: aspireMode ? (span.kind ?? 0) : (SPAN_KINDS[span.kind] ?? 'SPAN_KIND_UNSPECIFIED'),
          // dump is milliseconds; OTLP uses nanoseconds (string int64)
          startTimeUnixNano: String(Math.round(span.startTime * 1_000_000)),
          endTimeUnixNano: String(Math.round(span.endTime * 1_000_000)),
          attributes: attributesToOtlp(span.attributes),
          events: (span.events ?? []).map((event) => ({
            name: event.name,
            timeUnixNano: String(Math.round((event.time ?? span.startTime) * 1_000_000)),
            attributes: attributesToOtlp(event.attributes),
          })),
          status: {
            code: aspireMode
              ? (span.status?.code ?? 0)
              : (STATUS_CODES[span.status?.code ?? 0] ?? 'STATUS_CODE_UNSET'),
          },
        })),
      },
    ],
  })
}

process.stdout.write(`${JSON.stringify({ resourceSpans }, null, 2)}\n`)
