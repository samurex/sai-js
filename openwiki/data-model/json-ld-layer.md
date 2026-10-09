---
type: data-model
title: JSON-LD read/write layer
description: The JSON-LD-first transport shared by the data-model and authorization-agent packages — fetchJsonLd/putJsonLd/frameDoc/linkedIrisJsonLd/withContext helpers, the shared dataModelContext framing, createContainer semantics, the single WhatwgFetch, and the SPARQL-quad vs JSON-LD-CRUD split.
tags: [json-ld, transport, framing, typescript, solid]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T20:45:09.690Z
sources:
  - id: openwiki-source-654e83ca378000da767000a7
    resource: repo://packages/authorization-agent/src/agent-registration.ts
  - id: openwiki-source-81f61b66ae2ead4432d4358a
    resource: repo://packages/authorization-agent/src/sparql.ts
  - id: openwiki-source-5f3a5827ade0bebc11f29499
    resource: repo://packages/data-model/src/context.ts
  - id: openwiki-source-82fe23672fc8cac2a228f590
    resource: repo://packages/utils/src/container.ts
  - id: openwiki-source-d900b4364e5e03dbadc6c83e
    resource: repo://packages/utils/src/jsonld.ts
  - id: openwiki-source-5fb2d11486c54acb71821300
    resource: repo://packages/utils/src/sparql-update.ts
  - id: openwiki-source-228968b8fb4f70750899249e
    resource: repo://packages/utils/src/whatwg-fetch.ts
generated: { by: "pi", at: "2026-10-09T20:45:09.690Z" }
---

# JSON-LD read/write layer

The entity POJOs (see [Data model entities](entities.md)) are carried to and
from the Solid servers through a small JSON-LD transport in
`packages/utils`, with the Turtle/quad machinery kept strictly at the SPARQL
and ACP/ACR boundaries.

## Core helpers (`packages/utils/src/jsonld.ts`)

- `fetchJsonLd(iri, fetch)` — a raw GET with `Accept: application/ld+json`,
  returning `response.json()` and throwing on a non-OK response.
- `putJsonLd(iri, fetch, doc, headers?)` — expands the doc via
  `expandedJsonLd` (a context-stripping `jsonld.expand`), JSON-stringifies it,
  and PUTs with `Content-Type: application/ld+json`. The expanded form means
  the wire body never carries a client `@context`.
- `frameDoc(doc, context, iri, overrides?)` — frames one node with
  `jsonld.frame(buildFrame(...))` (default `@embed: '@never'` /
  `@omitDefault: true`) and throws if the node is absent. `frameNode` is its
  typed front, and `frameDataset` wraps `jsonld.fromRDF`.
- `linkedIrisJsonLd(id, fetch, propertyIri)` — builds a per-call
  `@type:@id`/`@set` context, frames a fetched document, and returns
  `node[propertyIri] ?? []`.
- `withContext(context, node)` — attaches the `@context` to a POJO for the
  `toJsonLd` write path.

## Framing invariants

The shared `dataModelContext` aliases `id` to `@id` and maps `@type` to a
`@set` container, so `type` is always a `string[]` on reads and on expanded
writes. POJO types declare `type: string[]` accordingly; presence is enforced
by TypeScript rather than a runtime validator.

## Container creation

`createContainer(id, fetch, dataset)` PUTs an empty container first (CSS
ignores the request body), then `applyPatch`s the triples onto the discovered
description resource. The three container-creating callers
(`data-registration`, `application-registration`, `social-agent-registration`)
route through it rather than PUTting bodies to container URLs.

## Fetch boundary

`packages/utils/src/whatwg-fetch.ts` is the single `WhatwgFetch` type —
`fetch.ts`/`RdfFetch` are gone from source (only stale build artifacts
remain). Resource CRUD uses raw JSON-LD (`putJsonLd`/`fetchJsonLd`/`frameNode`),
while the SPARQL-patch layer keeps quad machinery (`DatasetCore`, the N3
`Store`, `fetchTriples`, `graphDoc` via `jsonld.fromRDF`) in
`packages/authorization-agent/src/sparql.ts`. Turtle survives only at the two
non-JSON-LD boundaries: the ACP/ACR templates
(`setAcr` → `parseTurtle(agentRegistrationAcrTemplate(...))` →
`text/turtle`) and the SPARQL `INSERT/DELETE DATA` patches
(`insertPatch`/`deletePatch` embed `serializeTurtle`).

## Known debt

- `packages/authorization-agent/src/access-description-set.ts` is still
  quad-based (`parseJsonl` + `DatasetCore`), not yet moved to the framed POJO
  path.
- `parseJsonl` (`jsonld-parser.ts`) and `toStore` (`jsonld.ts`) overlap — both
  run `jsonld.toRDF` and copy quads into a new N3 `Store`.
- `linkedIrisJsonLd` takes a `propertyIri` and builds its own minimal context,
  but does not accept a caller-supplied context.
