---
type: architecture
title: Org-context data plane
description: The org-admin data plane — the SPARQL read plane (queries/org.ts, sparqlTransportFor), the /sparql-admin HTTP-QUERY endpoint, the /.sai/proxy-admin GET-only JSON-LD-only proxy, the admin-side peer clients, and the ACP non-cascade constraint with its seeded-resource mutation debt.
tags: [org-context, sparql, proxy, admin, architecture]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T20:45:09.690Z
sources:
  - id: openwiki-source-77182bdd0f02f880bb397ec8
    resource: repo://packages/components/src/AdminSparqlHandler.ts
  - id: openwiki-source-32079b13473bb3dd34f28c63
    resource: repo://packages/components/src/ProxyAdminHandler.ts
  - id: openwiki-source-d1409b74f54faf54952386b2
    resource: repo://packages/components/src/services/adminGate.ts
  - id: openwiki-source-c31122c417f3c9495c173def
    resource: repo://packages/components/src/services/peerFetch.ts
  - id: openwiki-source-646b076a27429fd93464a990
    resource: repo://packages/components/src/services/peerProxy.ts
  - id: openwiki-source-d5d71ad8cddece4a004d0065
    resource: repo://packages/components/src/services/queries/org.ts
generated: { by: "pi", at: "2026-10-09T20:45:09.690Z" }
---

# Org-context data plane

When a signed-in admin operates in an organization's context, the service layer
reads the org's registries and the peers' granted data over dedicated
admin-gated endpoints rather than the personal session's store. This page
documents that data plane; the context-resolution rules that select it are in
[RPC contract and service layer](../services/rpc-and-services.md).

## SPARQL read plane

`packages/components/src/services/queries/org.ts` supplies the org-side
transport: `adminSparqlTransport` implements `fetchBindings` (SELECT) and
`fetchTriples` (CONSTRUCT) over HTTP `QUERY` requests to
`/.sai/sparql-admin/<base64url-org>`, built by `adminSparqlQuery`.
`sparqlTransportFor(ctx)` dispatches on context — the session's
`localSparqlTransport` for the personal context, `adminSparqlTransport` for an
org context. The actual SELECT/CONSTRUCT query strings live in
`packages/authorization-agent/src/sparql.ts`; `org.ts` only supplies the
transport.

## Admin-gated endpoints

- **`/.sai/sparql-admin`** (`AdminSparqlHandler`) accepts `QUERY` only — any
  other method is rejected with `MethodNotAllowedHttpError(['QUERY'])` — and
  calls `requireOrgAdmin`. The route config also pins `allowedMethods:
  ["QUERY"]`.
- **`/.sai/proxy-admin`** (`ProxyAdminHandler`) is GET-only; it resolves the
  org webId from the base64url path segment (`orgWebIdFromPath`), gates on
  `requireOrgAdmin`, and serves JSON-LD only (`isJsonLdContentType` check,
  `application/ld+json` response).
- **`requireOrgAdmin`** (`services/adminGate.ts`) returns 403 unless the org's
  registration of the caller carries a non-empty `hasAdminGrant`; an unknown
  org is indistinguishable from a non-admin.

## Peer data clients

`services/peerProxy.ts` provides the admin-side clients that read a peer's
granted data through the proxy: `fetchPeerDocument` GETs
`/.sai/proxy-admin/<base64url-org>?iri=<target>` with the admin session, and
`dataRegistrationContains`, `peerInstanceNode`, and `peerInstanceIris` route
org-context reads through it. The org-side `peerFetch.fetchPeerResource` pins
`Accept: application/ld+json` and guards the upstream content type with
`isJsonLdContentType` — the proxy never returns binary and upstream
authorization stays the peer's permission engine (safe-by-grant).

## Known limitations

CSS ACP does **not** cascade: `acp:memberAccessControl` applies only to
resources without their own `.acr`, so a per-resource ACR can hide a resource
from the org session. As a consequence, mutating or deleting pre-existing
**seeded** resources in the org context does not work today (recorded as known
debt); per-resource ACR rewrites such as `syncAdminAcr` are the intended fix.
