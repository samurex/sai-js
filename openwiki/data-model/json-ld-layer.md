---
type: data-model
title: JSON-LD read/write layer
description: The JSON-LD-first transport shared by the data-model and authorization-agent packages — framing-not-compacting, the selectNode whitelist, the loader factory, the read and write paths, the activity-registry class-gated decode, embedding semantics, manual helpers, and the self-graph SPARQL scoping hygiene.
tags: [json-ld, transport, framing, typescript, solid, sparql]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T21:04:39.559Z
sources:
  - id: openwiki-source-82daddf07d8ad3efedbe52d2
    resource: repo://packages/authorization-agent/src/activity-registry.ts
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
generated: { by: "pi", at: "2026-10-09T21:04:39.559Z" }
---

# JSON-LD read/write layer

The entity POJOs (see [Data model entities](entities.md)) are carried to and
from the Solid servers through a JSON-LD transport in `packages/utils`, with
Turtle/quad machinery kept at the SPARQL and ACP/ACR boundaries.

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
writes. Reads use **framing, not compacting** — compaction cannot filter to one
node in a multi-node document, resolve `@reverse`, or omit absent keys.
`buildFrame` gives every property `@embed: '@never'` / `@omitDefault: true`, so
node refs stay plain-IRI references and `@reverse` children resolve on the
top-level matched node.

## Selection and loaders

Framing emits **every** property of the focus node, so frame entries govern
embedding/omission but not inclusion. The per-model whitelist is
`selectNode(node, terms)`: `id`/`type` plus exactly the model's terms, present
values only, with **no defaults** (absent means `undefined`; empty `@set`
arrays round-trip as absent and consumers coalesce with `?? []`).
Language-tagged literals compact to `{ '@value', '@language' }`, read through
the `opt(node, key)` unwrapper.

There are no `loadX` exports; consumers compose the generic
`loader(fromJsonLd)` factory at module top, which infers `T` from the reader's
return type and threads `fetchJsonLd` through it.

## Activity decode (class-gated framing)

`frameActivity` (`packages/authorization-agent/src/activity-registry.ts`)
sniffs the raw doc's `@type` and picks a frame per class:

- `AuthorizationGranted` — **two-phase**: the default frame makes `as:object`
  plain-IRI strings; a second frame re-frames the same doc once per object id
  via `DataAuthorizationFromJsonLd`, giving each embedded object a uniform
  top-level read (so `@reverse` children resolve) without dereferencing.
- Need-based classes — the **deep** frame embeds the complete
  access-need group (`@embed: '@always'`) so the approval workflow resolves
  inherited children from the activity graph.
- Everything else — the wildcard `{ '@embed': '@always' }` on `object`:
  snapshot objects embed from the same document; a live-link object stays a
  plain-IRI string.

## Embedding semantics

- Single values collapse to scalars/objects unless the term has
  `@container: '@set'` (`type` is solved; `object` is not — mappers wrap with
  a scalar-or-array helper).
- `@reverse` resolves only on the top-level matched node, not on wildcard-
  embedded nodes.
- `@type` is an **unordered set** — class discrimination is by set membership,
  never tuple position.
- IRI-valued terms are coerced (`@type: '@id'`), so `client_id`-style values
  are always IRIs; a literal under a coerced term is a document defect.

## Manual helpers

- `documentValues(doc, iri, predicate)` — collects a predicate's values across
  **all** nodes of a document (frames only reach other nodes via a known path).
- `findNodeIdByType(doc, typeIri, base)` — first node of a type via a wildcard
  `{ '@type' }` frame.

## Container creation

`createContainer(id, fetch, dataset)` PUTs an empty container first (CSS
ignores the body), then `applyPatch`s the triples onto the discovered
description resource; the container-creating callers route through it.

## Fetch boundary

`packages/utils/src/whatwg-fetch.ts` is the single `WhatwgFetch` type. Resource
CRUD uses raw JSON-LD; the SPARQL-patch layer keeps quad machinery (`DatasetCore`,
N3 `Store`, `graphDoc` via `jsonld.fromRDF`) in
`packages/authorization-agent/src/sparql.ts`. Turtle survives only at the
ACP/ACR template boundary and the SPARQL `INSERT/DELETE DATA` patches.

## SPARQL graph scoping

Every resource's document body lives in its own named graph (`GRAPH <iri>`,
name == resource IRI); `meta:` graphs hold mirror metadata. The **activity
registry is the exception**: an activity's `as:object` may embed a projection
of a real resource, putting the embedded node's `rdf:type`/properties inside
the activity's graph — one graph, two subjects. Type-matching queries across
the dataset must therefore scope to the subject's own graph
(`FILTER(?g = ?s)`) or they return embedded (non-authoritative) "phantom"
claims — e.g. `findRolesWithMember` uses `FILTER(?g = ?role)` so a
`roleMembershipChanged` projection of a to-be role (activities are immutable)
cannot keep asserting stale membership.

## Known debt

- `packages/authorization-agent/src/access-description-set.ts` is still
  quad-based (`parseJsonl` + `DatasetCore`), not yet moved to the framed POJO
  path.
- `parseJsonl` (`jsonld-parser.ts`) and `toStore` (`jsonld.ts`) overlap — both
  run `jsonld.toRDF` and copy quads into a new N3 `Store`.
- `linkedIrisJsonLd` takes a `propertyIri` and builds its own minimal context,
  but does not accept a caller-supplied context.
