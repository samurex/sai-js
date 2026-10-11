'use strict'

// ── Bun compatibility: jose's `bun` export condition ────────────────────────
// jose 5.x maps the `bun` condition to its browser/WebCrypto build. CSS's
// CachedJwkGenerator generates a key pair and then exports the private key as a
// JWK; the WebCrypto build defaults `extractable` to false and cannot export
// Node KeyObjects, so it throws:
//   "non-extractable CryptoKey cannot be exported as a JWK".
// Node loads jose's node build (node:crypto KeyObjects), where this works.
// Under Bun, redirect `require('jose')` coming from @solid/community-server to
// that package's node build. Scoped to CSS so our own jose v6 usage is
// untouched. No-op on Node.
if (process.versions.bun) {
  const fs = require('node:fs')
  const path = require('node:path')
  const Module = require('node:module')
  const marker = `${path.sep}@solid${path.sep}community-server${path.sep}`
  const nodeJoseFor = (parentFilename) => {
    const idx = parentFilename.indexOf(marker)
    if (idx === -1) return undefined
    const cssRoot = parentFilename.slice(0, idx + marker.length - 1)
    const nodeModules = path.dirname(path.dirname(cssRoot))
    const candidates = [
      path.join(cssRoot, 'node_modules', 'jose', 'dist', 'node', 'cjs', 'index.js'),
      path.join(nodeModules, 'jose', 'dist', 'node', 'cjs', 'index.js'),
    ]
    return candidates.find((candidate) => fs.existsSync(candidate))
  }
  // Module._resolveFilename is private API — the only hook Bun exposes for this.
  // eslint-disable-next-line no-underscore-dangle
  const originalResolve = Module._resolveFilename
  // eslint-disable-next-line no-underscore-dangle
  Module._resolveFilename = function (request, parent, ...rest) {
    if (request === 'jose' && parent && typeof parent.filename === 'string') {
      const target = nodeJoseFor(parent.filename)
      if (target) return target
    }
    return originalResolve.call(this, request, parent, ...rest)
  }
}

/**
 * Synchronous CJS side-effect bootstrap for CSS servers (no app-level
 * entrypoint we own). Usage:
 *
 *   node --require /sai/packages/components/src/tracing/preload.cjs <css-server.js>
 *   bun  --preload /sai/packages/components/src/tracing/preload.cjs <css-server.js>
 *
 * MUST use a *preload* (not an import): it runs synchronously before the main
 * module, so the http instrumentation patches `http.Server.prototype.emit`
 * before CSS builds its server. Nothing outside our compose/dagger command
 * lines adds this.
 */
const hardDisabled =
  process.env.OTEL_SDK_DISABLED === 'true' || process.env.OTEL_TRACES_EXPORTER === 'none'
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
// dagger overrides OTEL_EXPORTER_OTLP_ENDPOINT with its own telemetry endpoint,
// so our collector endpoint travels in this dedicated var and is passed to the
// exporter explicitly (see bootstrap.ts)
const saiEndpoint = process.env.SAI_OTLP_ENDPOINT
if (!hardDisabled && (saiEndpoint || otlpEndpoint)) {
  try {
    const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http')
    const { UndiciInstrumentation } = require('@opentelemetry/instrumentation-undici')
    const { resourceFromAttributes } = require('@opentelemetry/resources')
    const { NodeSDK } = require('@opentelemetry/sdk-node')
    const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base')
    const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions')

    const serviceName = process.env.OTEL_SERVICE_NAME ?? 'sai-uas'

    const resource = resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName })
    // headers → span attributes: the subset the diagram http blocks care
    // about — auth/type headers + the discovery Link. TEST/CI only:
    // cookie/authorization carry real session tokens; keep this OFF unless
    // the collector is ours (OTEL_CAPTURE_HEADERS=true, dagger test env).
    const requestHeaders = [
      'authorization',
      'cookie',
      'content-type',
      'accept',
      'if-none-match',
      'link',
    ]
    const responseHeaders = ['link', 'content-type', 'location', 'vary']
    // Headers only when the caller opts in (OTEL_CAPTURE_HEADERS=true — the
    // dagger test collector sets it): authorization/cookie carry real session
    // tokens, so never send them to an unrelated collector. undici takes a
    // DIFFERENT shape than http.
    const captureHeaders = process.env.OTEL_CAPTURE_HEADERS === 'true'
    const headersToSpanAttributes = captureHeaders
      ? {
          client: { requestHeaders, responseHeaders },
          server: { requestHeaders, responseHeaders },
        }
      : undefined
    const undiciHeadersToSpanAttributes = captureHeaders
      ? { requestHeaders, responseHeaders }
      : undefined
    // SimpleSpanProcessor (NOT batch): dagger kills the service right after
    // the test exec — batch would lose tail spans. The exporter is handed
    // SAI_OTLP_ENDPOINT explicitly — the dagger engine injects standard OTLP
    // env (OTEL_EXPORTER_OTLP_ENDPOINT/_TRACES_EXPORTER) into exec containers
    // for its own telemetry, so letting it read those would silently ship our
    // spans to their collector. Unset saiEndpoint → falls back to the
    // standard vars (compose dev loop -> the tempo service).
    const spanProcessor = new SimpleSpanProcessor(
      new (require('@opentelemetry/exporter-trace-otlp-http').OTLPTraceExporter)(
        saiEndpoint ? { url: `${saiEndpoint}/v1/traces` } : undefined
      )
    )
    // cross-realm holder — read by temporal/client.ts in this same process
    globalThis[Symbol.for('sai.otel.temporalPluginConfig')] = { resource, spanProcessor }

    // registry/data/id re-query the SPARQL store for every operation (91% of
    // sai-registry spans and 50% of sai-id = its own sparql POSTs) — skip
    // those client spans in those processes only; sai-uas keeps them
    // (diagram [Data]/[Grant] hops)
    const skipSparqlStoreSpans = ['sai-registry', 'sai-data', 'sai-id'].includes(
      process.env.OTEL_SERVICE_NAME
    )

    const sdk = new NodeSDK({
      resource,
      spanProcessors: [spanProcessor],
      instrumentations: [
        new HttpInstrumentation({
          headersToSpanAttributes,
          ignoreOutgoingRequestHook: (options) =>
            skipSparqlStoreSpans && `${options.hostname ?? options.host ?? ''}`.includes('sparql'),
        }),
        new UndiciInstrumentation({
          headersToSpanAttributes: undiciHeadersToSpanAttributes,
          ignoreRequestHook: (request) => skipSparqlStoreSpans && request.origin.includes('sparql'),
        }),
      ],
    })
    sdk.start()
  } catch (err) {
    // fail-soft: telemetry must never break the application
    console.warn(
      `[otel] failed to start OpenTelemetry for ${process.env.OTEL_SERVICE_NAME ?? 'sai-uas'}:`,
      err
    )
  }
}
