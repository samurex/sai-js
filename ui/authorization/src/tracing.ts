import { WebSdk } from '@effect/opentelemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { getRuntimeConfig } from './runtime-config'

/**
 * Browser half of docs/opentelemetry.md. It mirrors the two server-side pieces
 * that already exist:
 *
 * - `test/setup.ts` holds the trace roots (one span per interaction)
 * - `packages/components/src/tracing/effect-tracer.ts` exports Effect spans
 *   through the OTel provider
 *
 * Here `WebSdk.layer` supplies both: it builds a `WebTracerProvider` whose
 * tracer backs Effect's spans. The span that matters is the one
 * `@effect/platform`'s HttpClient creates per request
 * (`Effect.withSpan('http.client <METHOD>', { kind: 'client' })`), because that
 * is the span `HttpTraceContext` reads when
 * `HttpClient.currentTracerPropagation` (default on) adds the W3C `traceparent`
 * and `b3` request headers. The UAS already inherited a parent span from it,
 * which Tempo could not resolve (`<root span not yet received>`); exporting the
 * browser spans is what makes that parent real.
 *
 * `otlpBaseUrl` is resolved against the page origin so the default `/otlp`
 * posts same-origin (Tempo's OTLP receiver sends no CORS headers); traefik
 * strips the prefix and forwards to the `tempo` service.
 */
function tracesUrl(): string {
  const { otlpBaseUrl } = getRuntimeConfig()
  return new URL(`${otlpBaseUrl}/v1/traces`, window.location.origin).toString()
}

export const UiTracingLive = WebSdk.layer(() => ({
  resource: { serviceName: 'sai-ui' },
  spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter({ url: tracesUrl() })),
}))
