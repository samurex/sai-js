import Module, { createRequire } from 'node:module'

import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import type { Attributes } from '@opentelemetry/api'
import { isTracingSuppressed } from '@opentelemetry/core'

/**
 * Bun replacement for `@opentelemetry/instrumentation-undici`.
 *
 * Bun's `fetch` is native — it never publishes undici's `diagnostics_channel`
 * events, so UndiciInstrumentation records nothing and, worse, no
 * `traceparent` is injected: every downstream service starts a new trace.
 * This wraps `globalThis.fetch` with a CLIENT span + W3C context injection.
 *
 * The caller's `init` is forwarded as-is (only `headers` replaced) — routing
 * through `new Request(input, init)` would drop Bun-only options such as
 * `unix`, `tls` and `proxy`.
 *
 * Bun also swaps the `node-fetch` package for a builtin that calls native
 * fetch directly (bypassing both `globalThis.fetch` and `http.request`) —
 * used by `cross-fetch` (CSS's WebhookEmitter) and access-token-verifier
 * (WebID / OIDC issuer lookups) — so that is traced as well.
 *
 * Shared by `bootstrap.ts` (ESM) and `preload.cjs` (Bun can `require()` .ts).
 */

const TRACED = Symbol.for('sai.otel.bunFetch')

type Fetch = typeof fetch & { [TRACED]?: true }

export interface BunFetchInstrumentationConfig {
  /** skip span + propagation for matching requests */
  ignore?: (url: URL, method: string) => boolean
  /** captured as `http.request.header.<name>` (same opt-in as the http instrumentation) */
  requestHeaders?: string[]
  /** captured as `http.response.header.<name>` */
  responseHeaders?: string[]
}

type NodeFetchModule = Fetch & { default?: Fetch; fetch?: Fetch }

const NODE_FETCH_ID = '/__sai_otel__/node-fetch.cjs'

export function instrumentBunFetch(config: BunFetchInstrumentationConfig = {}): void {
  globalThis.fetch = traced(globalThis.fetch, config)

  const require = createRequire(import.meta.url)
  let nodeFetch: NodeFetchModule
  try {
    nodeFetch = require('node-fetch')
  } catch {
    return // node-fetch not resolvable from here — nothing to wrap
  }
  if (nodeFetch[TRACED]) return
  const tracedModule: NodeFetchModule = traced(nodeFetch, config)
  tracedModule.default = tracedModule
  tracedModule.fetch = tracedModule
  // `.default` callers (cross-fetch, ESM default imports)
  nodeFetch.default = tracedModule
  nodeFetch.fetch = tracedModule
  // tsc's `__importDefault` (access-token-verifier) calls the module function
  // itself — Bun's builtin has no `__esModule` — so redirect CJS `require`
  // to the traced function (same `_resolveFilename` hook as the preload's jose
  // redirect)
  const cached = new Module(NODE_FETCH_ID)
  cached.filename = NODE_FETCH_ID
  cached.loaded = true
  cached.exports = tracedModule
  require.cache[NODE_FETCH_ID] = cached
  const ModuleInternals = Module as unknown as {
    _resolveFilename: (request: string, ...rest: unknown[]) => string
  }
  const originalResolve = ModuleInternals._resolveFilename
  ModuleInternals._resolveFilename = function (request: string, ...rest: unknown[]) {
    return request === 'node-fetch' ? NODE_FETCH_ID : originalResolve.call(this, request, ...rest)
  }
}

function traced(originalFetch: Fetch, config: BunFetchInstrumentationConfig): Fetch {
  if (originalFetch[TRACED]) return originalFetch
  const { ignore, requestHeaders = [], responseHeaders = [] } = config
  const tracer = trace.getTracer('sai-bun-fetch')

  const wrapped = function fetch(
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> {
    const request = input instanceof Request ? input : undefined
    const url = new URL(request ? request.url : String(input))
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    if (isTracingSuppressed(context.active()) || ignore?.(url, method)) {
      return originalFetch(input, init)
    }

    const headers = new Headers(init?.headers ?? request?.headers)
    const attributes: Attributes = {
      'http.request.method': method,
      'url.full': url.href,
      'server.address': url.hostname,
    }
    if (url.port) attributes['server.port'] = Number(url.port)
    for (const name of requestHeaders) {
      const value = headers.get(name)
      if (value !== null) attributes[`http.request.header.${name}`] = [value]
    }

    return tracer.startActiveSpan(method, { kind: SpanKind.CLIENT, attributes }, async (span) => {
      propagation.inject(context.active(), headers, {
        set: (carrier, key, value) => carrier.set(key, value),
      })
      try {
        const response = await originalFetch(input, { ...init, headers })
        span.setAttribute('http.response.status_code', response.status)
        for (const name of responseHeaders) {
          const value = response.headers.get(name)
          if (value !== null) span.setAttribute(`http.response.header.${name}`, [value])
        }
        if (response.status >= 400) span.setStatus({ code: SpanStatusCode.ERROR })
        return response
      } catch (err) {
        span.recordException(err as Error)
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message })
        throw err
      } finally {
        span.end()
      }
    })
  }

  // keep Bun's statics (fetch.preconnect)
  return Object.assign(wrapped, originalFetch, { [TRACED]: true as const })
}
