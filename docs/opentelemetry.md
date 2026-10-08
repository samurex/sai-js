# OpenTelemetry in sai-js

Opt-in distributed tracing for the test/CI environment (and the compose dev
loop). One waterfall per interaction spans the test runner (as the
browser/App), the UAS (`auth`), the id/registry/data CSS servers, and the
Temporal worker — W3C `traceparent` over HTTP, Temporal headers over gRPC.
Production is off by construction (no env vars → no-op, zero loaded OTel code).

## Usage

```bash
# run a test with dagger: the instrumented processes export OTLP straight to
# the compose Tempo on the host (:4318), so the traces land in the running
# Tempo during the exec — nothing to export or import afterwards
dagger call test --testFile=invitation.test.ts
# view (Grafana Tempo + Grafana — compose services; Tempo's built-in MCP at
# POST :3200/api/mcp). Reachability from the dagger containers defaults to the
# docker host on the compose network gateway (172.16.0.1); override with
# TEMPO_OTLP_ENDPOINT.
```

## Reset Tempo data (fresh slate before a run)

Blocks accumulate in the compose `sai-tempo-data` volume, so previous runs
stay searchable in Grafana/Tempo. To start clean — e.g. only the next run's
traces visible:

```bash
# in the devbox shell (the compose up needs $CAROOT from mkcert)
devbox shell
# stop + drop the tempo container, delete the blocks volume, recreate
docker compose stop tempo
docker compose rm -f tempo
docker volume rm sai-tempo-data
docker compose up -d tempo grafana
```

The old traces (and any leftover WAL/index) are gone; Tempo rebuilds its
blocklist on the next run.

## Env contract (each instrumented process)

| Var | Effect |
|---|---|
| `SAI_OTLP_ENDPOINT` | our own OTLP endpoint, handed to the exporter explicitly. Required in dagger, whose engine injects and overrides `OTEL_EXPORTER_OTLP_ENDPOINT` with its own telemetry endpoint; in dagger runs it points at the compose Tempo on the docker host (172.16.0.1:4318, override with `TEMPO_OTLP_ENDPOINT`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | live OTLP/HTTP export (compose dev loop → the `tempo` service) when `SAI_OTLP_ENDPOINT` is unset |
| `OTEL_SERVICE_NAME` | span `service.name` (sai-test / sai-uas / sai-id / sai-registry / sai-data / sai-worker) |
| `OTEL_CAPTURE_HEADERS=true` | attach the header attributes (`authorization`, `cookie`, …) to an OTLP export — the dagger test env sets it |
| `OTEL_SDK_DISABLED=true` / `OTEL_TRACES_EXPORTER=none` | hard-off |

Precedence is deliberate: the dagger engine injects `OTEL_EXPORTER_OTLP_ENDPOINT`
and `OTEL_TRACES_EXPORTER` into exec containers for its own telemetry and its
values win over the ones we set, so our collector endpoint travels in
`SAI_OTLP_ENDPOINT` and is passed to the exporter explicitly (the injected
standard vars are then ignored).

## Mechanics

- **Instrumentation**: `HttpInstrumentation` (server spans for CSS + node:http
  clients) + `UndiciInstrumentation` (global-fetch clients). `SimpleSpanProcessor`
  (synchronous — no batching, so no tail-span loss when dagger kills services).
- **Headers**: selected request/response headers captured as span attributes
  (`authorization`, `cookie`, `content-type`, `accept`, `if-none-match`,
  `link`, `location`, `vary`) with `OTEL_CAPTURE_HEADERS=true`, which the
  dagger test collector sets (they carry real session tokens, so an unrelated
  collector must not receive them). NB `HttpInstrumentation` and
  `UndiciInstrumentation` take different shapes for it (`{client,server}` vs
  `{request,response}Headers`).
- **Per-test roots** (test runner): a root span named after each vitest test;
  `context.attach` via the private `_getContextManager` (api 1.9 removed
  `attach` from the public facade).
- **RPC**: `ApiHandler` wraps the call in an active `sai.rpc.handle` span
  (`sai.webid`/`sai.account`/`sai.rpc.method`); full payloads on the same
  span — `sai.rpc.request` (all incoming RPC envelopes, captured before the
  envelope trace rewrite so it's the wire payload as received) and
  `sai.rpc.response` (the @effect/rpc response/return value, `Success`/`Failure`
  envelope) — both recording-only (`span.isRecording()`, zero stringify cost
  when tracing is off/un-sampled); the `@effect/rpc` envelope
  `traceId`/`spanId` are rewritten from that span (else Effect spans collapse
  into the envelope pseudo-trace); the Effect bridge
  (`tracing/effect-tracer.ts`) exports @effect/rpc's per-method spans
  (`Rpc.router <Tag>`) with `Effect.fail` → ERROR + event, via `Tracer.layerGlobal`
  (the SDK-registered global provider).
- **JSON-LD payloads** (`packages/utils/src/jsonld.ts` — the
  `@janeirodigital/interop-utils` workspace source): manual spans around the
  uniform fetch/decode/write helpers, so every documented payload lands in
  the dump:
  - `fetchJsonLd` → `sai.jsonld.raw` — the wire document as received
    (expanded/compacted/flattened); the auto HTTP client span nests inside
    as the actual GET
  - `frameDoc` → `sai.jsonld.framed` — the framed node with its embedded
    `@context` stripped (`withoutContext`, the POJO form `frameNode`
    produces) — the decoded payload consumers actually read; appears as a
    sibling of `fetchJsonLd` under the same RPC span
  - `putJsonLd` → `sai.jsonld.framed` (the caller's context-attached POJO,
    `@context` stripped) + `sai.jsonld.expanded` (the actual wire body PUT)
  All carry `sai.jsonld.uri`, are recording-only (`span.isRecording()`), and
  set ERROR + `recordException` on failures. Requires
  `@opentelemetry/api` as a direct dep of `packages/utils`.
- **SPARQL** (`withSparqlTracing` in `packages/authorization-agent/src/sparql.ts`,
  applied to BOTH transports — personal internal endpoint and org
  `/sparql-admin`): every registry-plane read (SELECT/CONSTRUCT) runs inside a
  `sparql.query` span with `sai.sparql.query` (verbatim text),
  `sai.sparql.endpoint`, `sai.sparql.form`, `sai.sparql.resultCount`
  (bindings/triples count — result payloads are not recorded, only counts).
  Recording-only; ERROR + `recordException` on failure. Requires
  `@opentelemetry/api` as a direct dep of `packages/authorization-agent`.
- **Temporal**: `@temporalio/interceptors-opentelemetry-v2` `OpenTelemetryPlugin`
  on the three workers + the client, sharing the same `spanProcessor`
  (holder: `tracing/otel-state.ts`, cross-realm via `Symbol.for`).
- **Noise reduction**: registry/data/id skip their own SPARQL-store client
  spans (`ignoreRequestHook`/`ignoreOutgoingRequestHook`, service-name gated) —
  91% of registry traffic was their own re-queries; `sai-uas` keeps sparql
  spans (the diagrams' `[Data]`/`[Grant]` hops).

## Where it lives

New (`packages/components/src/tracing/`): `bootstrap.ts` (async gate/init),
`preload.cjs` (sync CJS CSS preload — `--require`, see header: `--import`
races the main module), `otel-state.ts`, `effect-tracer.ts`.

Compose trace stack (`docker-compose.yaml` + `tempo/tempo.yaml` +
`grafana/provisioning/datasources/tempo.yaml`): `tempo` (OTLP in on 4317/4318,
TraceQL API and the built-in MCP server on 3200) and `grafana` (provisioned
Tempo datasource, anonymous admin, for viewing traces). Tempo's MCP server
(`query_frontend.mcp_server.enabled`) speaks streamable HTTP at
`POST /api/mcp` and exposes `traceql-search`, `get-trace`,
`get-attribute-names`/`get-attribute-values`,
`traceql-metrics-instant`/`traceql-metrics-range` and `docs-traceql`, so no
separate MCP container is needed. Search serves recent traces from the
backend blocks, not only the live ingesters: `query_frontend.search`
`query_backend_after: 5s` (short) with `query_end_cutoff: 1s` — Tempo
validates `query_backend_after > query_end_cutoff` (the cutoff defaults to
30s, which would crash with a 5s backend window).

Browser spans (`ui/authorization/src/tracing.ts` plus `effect.ts`):
`WebSdk.layer` supplies a `WebTracerProvider` whose tracer backs Effect's
spans. The relevant span is the per-request `http.client <METHOD>` span that
`@effect/platform`'s HttpClient creates, because `HttpTraceContext` reads it
(`HttpClient.currentTracerPropagation`, default on) to write the W3C
`traceparent`/`b3` headers. The UAS already inherited a parent from it, which
Tempo could not resolve (`<root span not yet received>`); exporting the browser
spans fixes that. The endpoint is `config.json`'s `otlpBaseUrl` resolved
against the page origin (default `/otlp`), routed by traefik to `tempo:4318`
with the prefix stripped, because Tempo's OTLP receiver sends no CORS headers.

Tempo 3's live store starts a block at ingestion (`live_store.max_block_duration`)
and takes the block end from the latest span end; `storage.trace.wal`'s
`ingestion_time_range_slack` is ignored, so a back-dated push lands in a block
whose range runs backwards (start > end) and search prunes it. This is why
traces go straight to the compose Tempo (default live-store timings) instead
of a per-run collector: the test-runner root span ends ~1-2s after the last
child (in the final `afterEach`), and a collector with a short
`max_trace_idle` cut the block before the root arrived and dropped it.

Added to existing files:

- `packages/components/src/ApiHandler.ts` — `sai.rpc.handle` active span,
  `sai.rpc.request`/`sai.rpc.response` payload capture, envelope trace
  rewrite, `withEffectTracing`
- `packages/utils/src/jsonld.ts` — `fetchJsonLd`/`frameDoc`/`putJsonLd`
  spans with `sai.jsonld.raw`/`sai.jsonld.framed`/`sai.jsonld.expanded`
  payload attributes (`@context` stripped; recording-only)
- `packages/utils/package.json` — `@opentelemetry/api` dep
- `packages/authorization-agent/src/sparql.ts` — `withSparqlTracing` +
  `sparql.query` spans on `localSparqlTransport` (personal context)
- `packages/components/src/services/queries/org.ts` — same wrap on
  `adminSparqlTransport` (org `/sparql-admin`)
- `packages/authorization-agent/package.json` — `@opentelemetry/api` dep
- `packages/components/src/workers/main.ts` — init, Temporal plugin on the 3
  workers, `sdk.shutdown()`
- `packages/components/src/temporal/client.ts` — `OpenTelemetryPlugin` on `Client`
- `packages/components/src/index.ts` — exports `initNodeTracing`
- `packages/components/package.json` — OTel deps, `@temporalio/* ^1.24`,
  `@temporalio/interceptors-opentelemetry-v2`, `@effect/opentelemetry`,
  `@opentelemetry/sdk-trace-web` (peer)
- `test/setup.ts` — init, per-test root spans, seed suppression
  (`suppressTracing`)
- `.dagger/src/index.ts` — per-service `SAI_OTLP_ENDPOINT` /
  `OTEL_SERVICE_NAME` / `OTEL_CAPTURE_HEADERS`, `--require` preloads; the
  endpoint points at the compose Tempo on the docker host (172.16.0.1,
  override with `TEMPO_OTLP_ENDPOINT`), so dagger runs trace straight into
  the running Tempo with no export/import step
- `docker-compose.yaml` — `tempo`/`grafana` trace stack + the traefik `/otlp`
  route on the UI host; `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_SERVICE_NAME` on
  auth/data/registry/id (each with a `--require` preload); worker uses the
  async bootstrap (no preload) and runs `dist/`, so it needs a rebuild to pick
  up tracing changes
- `ui/authorization/src/tracing.ts` — web OTel layer (the browser roots)
- `ui/authorization/src/effect.ts` — `UiTracingLive` provided alongside the
  RPC client's HttpClient layer
- `ui/authorization/src/runtime-config.ts` + `public/config.json` — `otlpBaseUrl`