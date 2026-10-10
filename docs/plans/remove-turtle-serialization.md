# Remove Turtle serialization — drop `parseTurtle` and `serializeTurtle`

> **Status:** ✅ Phases 0–6 landed — `parseTurtle`/`serializeTurtle` deleted; the codebase is JSON-LD-first on both sides of the wire. **Phase 7** (drop the `n3` dependency) remains ⬜.
>
> **Goal.** Delete `packages/utils/src/turtle-parser.ts` (`parseTurtle`) and `packages/utils/src/turtle-serializer.ts` (`serializeTurtle`) entirely. After this plan the codebase is JSON-LD-first on both sides of the wire:
>
> - **SPARQL DATA bodies** come from a new `toNQuads` helper — `jsonld.toRDF(doc, { format: 'application/n-quads' })` — no N3 `Store`, no N3 `Writer`.
> - **ACRs** are JSON-LD end to end: read via `fetchJsonLd` + frame, mutated in compacted/framed form, written via `putJsonLd` (expanded on the wire).
> - **`/sparql-admin` CONSTRUCT** responses are `application/ld+json`; the org-context transport parses with `toStore`.
> - **Reciprocal mirror** writes named-graph N-Quads produced by `toNQuads`.
> - **Storage notifications** stream NDJSON of **expanded JSON-LD** instead of Turtle chunks.
>
> **Why.** Every remaining consumer is a thin wrapper around N3 `Parser`/`Writer` feeding either a SPARQL textual patch, an RDF/JS `Store`, or a Turtle HTTP body. The read side is already JSON-LD (`parseJsonld`/`fetchJsonLd`/`toStore`, backed by `jsonld.toRDF`), the storage backend is SPARQL (Oxigraph) so the ACR write `Content-Type` only selects a parser (CSS `QuadToRdfConverter` lists `application/ld+json`), and the notification pipeline's source serializer already emits JSON-LD (`JsonLdNotificationSerializer`).
>
> **Each phase starts green and ends green:** `npm run build` (turbo) + `npm test` (turbo, packages) must pass before and after. Pin the new behavior with a test *before* changing the code that would break it. The `test/` integration workspace (dagger-only) resolves packages via workspace symlinks (root `node_modules/@janeirodigital/interop-utils -> ../../packages/utils`), so it sees source changes after a build — no publish needed; run it as the final gate per phase where it is exercised.

---

## Decisions (resolved)

| # | Decision | Choice |
|---|---|---|
| 1 | ACR wire format | **JSON-LD.** Dedicated phase; internally compacted/framed, PUT expanded (mirrors the rest of the JSON-LD code). |
| 2 | `/sparql-admin` CONSTRUCT wire format | **`application/ld+json`** (expanded). Server `jsonld.fromRDF`, client `toStore(await response.json())`. |
| 3 | Reciprocal mirror named graphs | **JSON-LD named-graph N-Quads** via `toNQuads({ '@id': graphIri, '@graph': doc })`; drop the `GRAPH { }` wrapper. |
| 4 | Published API removal | **Hard-remove** both helpers + `insertPatch`/`deletePatch` signature change; bump `@janeirodigital/interop-utils` to `1.0.0-rc.27` (internal `^1.0.0-rc.26` ranges still match). |
| 5 | Storage notification stream | **Reimplement in `@elfpavlik/sai-components`**, NDJSON of **expanded JSON-LD**, reuse the existing `EventsHandler` NDJSON pattern, drop `text/turtle` streaming entirely. |
| 6 | N3 dependency | **Drop it.** Replace N3 `Store` with `@rdfjs/dataset` and N3 `DataFactory` with `@rdfjs/data-model` (both already in the tree), remove `n3`/`@types/n3`; tests use `jsonld.fromRDF`/`@rdfjs/*`, not N3. |

---

## Current state (authoritative inventory)

### `parseTurtle` — `packages/utils/src/turtle-parser.ts`, exported at `packages/utils/src/index.ts:1`

| Consumer | Kind | Site | Phase |
|---|---|---|---|
| `data-model`-moved setAcr | production | `packages/authorization-agent/src/agent-registration.ts:32` `setAcr` | 2 |
| Notification stream | production | `packages/application/src/notification-manager.ts:89` `handleStream` | 5 |
| Admin ACR rewrite | production | `packages/components/src/temporal/activities/admin.ts:317` `syncAdminAcr` | 2 |
| Org-context CONSTRUCT | production | `packages/components/src/services/queries/org.ts:150` `fetchTriples` | 3 |
| Integration test infra | test | `test/util.ts:105` `awaitNotification` | 5 |
| Integration tests | test | `test/revocation-rpc.test.ts:53`, `test/delegation-endpoint.test.ts:65` (grant-registry GET) | 3 |
| Integration tests | test | `test/admin-events.test.ts:280`, `test/personal-admin.test.ts:106` (ACR GET) | 2 |
| Unit tests | test | `utils/test/match.test.ts:23`, `utils/test/sparql-update.test.ts:52,59`, `utils/test/turtle-parser.test.ts` (whole file), `utils/test/turtle-serializer-test.ts` | 6 |

### `serializeTurtle` — `packages/utils/src/turtle-serializer.ts`, exported at `packages/utils/src/index.ts:4`

| Consumer | Kind | Site | Phase |
|---|---|---|---|
| SPARQL patch path | production | `packages/utils/src/sparql-update.ts:7,11` `insertPatch`/`deletePatch` | 1 |
| setAcr | production | `packages/authorization-agent/src/agent-registration.ts:41` | 2 |
| Admin ACR rewrite | production | `packages/components/src/temporal/activities/admin.ts:359` `syncAdminAcr` | 2 |
| `/sparql-admin` CONSTRUCT | production | `packages/components/src/AdminSparqlHandler.ts:156` | 3 |
| Reciprocal mirror | production | `packages/components/src/services/ReciprocalMirror.ts:116` (`GRAPH <iri> { … }`) | 4 |
| Unit tests | test | `utils/test/sparql-update.test.ts`, `utils/test/turtle-serializer-test.ts` | 6 |

### Transitive `insertPatch`/`deletePatch`/`addStatement`/`removeStatement`/`replaceStatement` callers (Phase 1)

- `packages/utils/src/container.ts:40` — `createContainer(id, fetch, dataset)`.
- `packages/authorization-agent/src/agent-registration.ts:57,71,109,110` — `addDataGrant`, `removeDataGrant`, `replaceDataGrants`.
- `packages/authorization-agent/src/social-agent-registration.ts:75,76` — `replaceAdminGrantLinks`; `:40` hand-built type quad + `createContainer`.
- `packages/authorization-agent/src/authorization-agent.ts:585-598` — `discoverAndUpdateReciprocal` (`addStatement`/`replaceStatement`).
- `packages/authorization-agent/src/application-registration.ts:50`, `data-registration.ts:22` — `createContainer` (already via `toStore(withContext(...))`).
- `packages/data-model/src/agent-registration.ts:14` `toDataset`, `packages/data-model/src/social-agent-registration.ts:67` `toDataset` — hand-built `DataFactory.quad` stores.

**Note (stale in the old plan):** `packages/data-model/src/crud/` no longer exists; CRUD moved to `packages/authorization-agent/src/`. `data-model/src/activity-registry.ts` no longer builds quad stores.

**Dependency (decision 6):** `n3` is currently used for `Store`/`DataFactory`/`Parser`/`Writer` across `utils`, `authorization-agent`, `data-model`, `components` (~30 files). Phases 1/3/4/6 remove the `Parser`/`Writer` and most hand-built quads; **Phase 7** replaces the remaining `Store`/`DataFactory` with `@rdfjs/dataset`/`@rdfjs/data-model` and removes the dependency. `@rdfjs/types` stays.

---

## Phase 0 — Add `toNQuads` helper (+ pinning tests)

New export in **`packages/utils/src/jsonld.ts`**, next to `toStore`:

```ts
/**
 * Serialize a JSON-LD document (with embedded context) to N-Quads text via
 * jsonld.toRDF. Default-graph documents yield N-Triples (valid Turtle data
 * block body); a named-graph doc `{ '@id': graphIri, '@graph': doc }` yields
 * N-Quads with the graph label in the 4th term.
 */
export async function toNQuads(doc: Record<string, unknown>, base?: string): Promise<string> {
  return (await jsonld.toRDF(doc, {
    format: 'application/n-quads',
    base,
    documentLoader,
  })) as unknown as string
}
```

Pinning tests — new `packages/utils/test/to-nquads.test.ts`:
- flat doc → every line `<s> <p> <o> .` with **no 4th term** (round-trip through N3 `Parser`, assert all `graph.termType === 'DefaultGraph'`);
- plain string literal stays `"plain"` (no `xsd:string` in output);
- JS number → `"42"^^xsd:integer`, boolean → `"true"^^xsd:boolean`;
- IRI-valued term needs `@type: '@id'` in the context (documents the requirement);
- empty doc → `''`;
- base IRI resolution for relative IRIs;
- **named graph:** `{ '@id': g, '@graph': doc }` → each line carries `<g>` as the 4th term.

**Done when:** `toNQuads` exported, tests pass, no consumer yet.

---

## Phase 1 — SPARQL patch path → JSON-LD docs

### 1a. `packages/utils/src/sparql-update.ts`

```ts
export async function insertPatch(doc: Record<string, unknown>, base?: string): Promise<string> {
  return `INSERT DATA { ${await toNQuads(doc, base)} }`
}
export async function deletePatch(doc: Record<string, unknown>, base?: string): Promise<string> {
  return `DELETE DATA { ${await toNQuads(doc, base)} }`
}
```

- `addStatement`/`removeStatement`/`replaceStatement` take `withContext(dataModelContext, …)` docs (not `Quad`s); drop `new Store([...])`.
- `applyPatch` unchanged (SPARQL `PATCH`, description resource discovered via HEAD + Link).
- Breaking API change to published `interop-utils` — accepted (decision 4); no `DatasetCore` overload.

### 1b. `packages/utils/src/container.ts`

- `createContainer(id, fetch, doc)` — pass the doc straight to `insertPatch`.
- Callers pass `withContext(dataModelContext, data)` directly:
  - `authorization-agent/src/application-registration.ts:50` (remove intermediate `toStore`),
  - `authorization-agent/src/data-registration.ts:22` (remove intermediate `toStore`),
  - `authorization-agent/src/social-agent-registration.ts:38-46` (replace `toDataset` + type quad with one doc).

### 1c. crud callers — replace `DataFactory.quad` with docs

| Site | Now | Doc |
|---|---|---|
| `authorization-agent/src/agent-registration.ts:52-57` `addDataGrant` | `quad(id, hasDataGrant, grant)` | `{ '@id': id, hasDataGrant: grantIri }` |
| `…:66-71` `removeDataGrant` | same | same |
| `…:103-110` `replaceDataGrants` | remove/add quad sets | doc `{ '@id': id, hasDataGrant: [...] }` per direction |
| `authorization-agent/src/social-agent-registration.ts:68-76` `replaceAdminGrantLinks` | remove/add quad sets | doc `{ '@id': id, hasAdminGrant: [...] }` |
| `authorization-agent/src/authorization-agent.ts:585-598` `discoverAndUpdateReciprocal` | `reciprocalRegistration` quad + prior quad | `{ '@id': id, reciprocalRegistration: iri }` for add/replace |
| `data-model/src/agent-registration.ts:14` `toDataset` | `Store` of `registeredAgent`/`hasDataGrant` | `withContext(dataModelContext, { '@id': data.id, registeredAgent, hasDataGrant })` |
| `data-model/src/social-agent-registration.ts:67` `toDataset` | `Store` of `label` (language map), `note`, plus the `registrationToDataset` fields (`registeredAgent`/`hasDataGrant`/`reciprocalRegistration`) | `withContext(dataModelContext, { '@id': id, label: data.label, note, …registrationToDataset fields, type: data.type })` — `label` is a language map (`@container: '@language'`, `dataModelContext:167`); the old `prefLabel` key no longer exists |

`removeStatement`/`replaceStatement` need the **exact prior statement** — callers already track the prior value (`authorization-agent.ts:591` priorQuad) → track the prior doc instead. Resulting quad is identical (default graph; plain literals get `xsd:string` under RDFJS, matching N3 `DataFactory.literal`).

### 1d. tests

- `packages/utils/test/sparql-update.test.ts` — build expected bodies via `toNQuads`, or assert round-trip (parse the data block back, compare quads).
- `packages/data-model/test/crud/*` / authorization-agent tests asserting patched stores — unchanged (they assert server-side effects, not bodies).
- `packages/authorization-agent` and `packages/data-model` package tests run green.

**Done when:** no `DataFactory.quad`/`new Store(` construction remains in `authorization-agent/src/{agent-registration,social-agent-registration,authorization-agent,application-registration,data-registration}.ts` or the two `data-model` `toDataset`s; `serializeTurtle` left only in `setAcr`, `syncAdminAcr`, `AdminSparqlHandler`, `ReciprocalMirror`.

---

## Phase 2 — ACRs → JSON-LD (decision 1 = B)

> Start green: existing ACR tests (`test/admin-events.test.ts`, `test/personal-admin.test.ts`) pass against Turtle. End green: same tests pass reading/writing JSON-LD.

### 2a. ACP vocabulary + context

- Extend `ACP` in `packages/utils/src/namespaces.ts` (currently only `PublicAgent`/`PublicClient`) with `AccessControlResource`, `AccessControl`, `Policy`, `Matcher`, `apply`, `allow`, `anyOf`, `agent`, `client`, `resource`, `accessControl`, `memberAccessControl`; add `ACL.Control` to `ACL`.
- Add a dedicated `acrContext` (`packages/data-model/src/context.ts` or a sibling) with `@version: 1.1`, `id`/`type` aliases, and the ACP/ACL terms (node-ref vs literal coercion per JSON-LD).

### 2b. ACR model functions

- Replace the Turtle string generators `packages/data-model/src/templates/AgentRegistration.acr.ts` and `DataGrant.acr.ts` with JSON-LD builders (`…AcrJsonLd({...}) → withContext(acrContext, {...})`), mirroring the existing `toJsonLd` pattern.
- Keep `packages/data-model/src/templates/RegistrySet.ts` unchanged — the registry-set ACR is seeded via SPARQL named graphs, not an ACR PUT (used by `components/src/services/Account.ts:46`, `repl/add-user.ts:58`).
- Reads: `fetchJsonLd(acrId, fetch)` + `frameNode`/`frameDoc`; internal code uses the compacted/framed form only.

### 2c. Call sites

| Site | Change |
|---|---|
| `authorization-agent/src/agent-registration.ts:25-44` `setAcr` | `putJsonLd(acrLocation, fetch, agentRegistrationAcrJsonLd({ id, owner, peer }))` — removes the parse→serialize round trip |
| `components/src/temporal/activities/grants.ts:380-441` `createAcr` | `putJsonLd(acrId, session.fetch, dataGrantAcrJsonLd({...}))` |
| `components/src/temporal/activities/admin.ts:182-216` `createAdminGrantAcr` | `putJsonLd(acrId, session.fetch, dataGrantAcrJsonLd({...}))` |
| `components/src/temporal/activities/admin.ts:295-402` `syncAdminAcr` | `fetchJsonLd(acrId)` → mutate framed JSON-LD (strip the `#fullAdminAccess` `acp:apply`/`acp:anyOf` subtree + `#root` wiring, re-add) → `putJsonLd` |

`putJsonLd` (`packages/utils/src/jsonld.ts:412`) already expands before PUT; no new write helper needed.

### 2d. tests

- `test/admin-events.test.ts:280`, `test/personal-admin.test.ts:106` — read ACRs with `fetchJsonLd`/`toStore` instead of `Accept: text/turtle` + `parseTurtle`.
- New unit test for `syncAdminAcr`'s rewrite (remove + re-add `#fullAdminAccess`, empty-admin case) at the JSON-LD level.
- Verify CSS accepts the JSON-LD ACR PUT (integration/dagger).

**Done when:** `parseTurtle`/`serializeTurtle` have zero ACR consumers; the ACR tests pass on JSON-LD.

---

## Phase 3 — `/sparql-admin` CONSTRUCT → `application/ld+json` (decision 2 = C)

- `packages/components/src/AdminSparqlHandler.ts:152-158` — CONSTRUCT branch: `payload = JSON.stringify(await jsonld.fromRDF(store))`, `mediaType = 'application/ld+json'`; drop the `serializeTurtle` import. (The internal hop still uses `fetch-sparql-endpoint`'s own Turtle parsing — unaffected, not our helper.)
- `packages/components/src/services/queries/org.ts:76-86` — add `application/ld+json` to the `Accept` header.
- `org.ts:149-151` — `fetchTriples`: `toStore((await response.json()) as Record<string, unknown>)`; drop `parseTurtle`.
- Tests:
  - `packages/components/test/data-registry.test.ts:88-89` — mock the CONSTRUCT response as `application/ld+json` with an expanded body.
  - `test/revocation-rpc.test.ts:53`, `test/delegation-endpoint.test.ts:65` — grant-registry container GET: `Accept: application/ld+json` + `toStore`/`fetchJsonLd` instead of `parseTurtle`.
- Leave `test/policy-engine.test.ts` Turtle alone — generic CSS fixture PUT/GET, not a helper consumer.

**Done when:** neither `AdminSparqlHandler.ts` nor `org.ts` imports the helpers; component/unit tests green.

---

## Phase 4 — Reciprocal mirror → named-graph N-Quads (decision 3 = B)

- `packages/components/src/services/ReciprocalMirror.ts`:
  - `fetchGraph` returns the JSON-LD **doc** (drop the `toStore`/`Store`).
  - grant IRIs via `documentValues(doc, reciprocalIri, INTEROP.hasDataGrant)` (`packages/utils/src/jsonld.ts:295`) — **note:** document-wide; use `frameNode` + `strs` scoped to `reciprocalIri` if subject-scoping must be preserved exactly.
  - serialization: `toNQuads({ '@id': graphIri, '@graph': doc })`; assemble `INSERT DATA { <n-quads> }` without the `GRAPH { }` wrapper.
- Add a unit test pinning `{ '@id': g, '@graph': doc }` → N-Quads with `<g>` graph terms (overlaps Phase 0 tests).

**Done when:** `ReciprocalMirror.ts` no longer imports `serializeTurtle`/`toStore`; mirror behavior verified in the dagger suite.

---

## Phase 5 — NDJSON storage notifications (decision 5)

> Start green: current Turtle streaming works. End green: NDJSON expanded JSON-LD streaming works; both clients read it; Turtle streaming is gone.

### 5a. Server — `@elfpavlik/sai-components`

Reimplement (do not subclass) the two thin CSS classes, reusing the existing NDJSON pattern from `packages/components/src/EventsHandler.ts` (`guardStream(new PassThrough())`, heartbeat, `application/x-ndjson`):

1. **Channel factory + request handler.** A custom `StreamingHttpRequestHandler` whose channel is `{ …generateChannel fields, accept: 'application/x-ndjson' }`. CSS `StreamingHttp2023Util.js` hardcodes `accept: 'text/turtle'` and is not injectable, hence the reimplementation.
2. **Activity listener.** Custom `StreamingHttpListeningActivityHandler` using the same NDJSON channel factory.
3. **Serializer.** Custom `NotificationSerializer` that converts the compacted CSS `Notification` object into **expanded JSON-LD directly** (no `jsonld.expand` — `https://www.w3.org/ns/solid/notification/v1` 404s publicly), appends `\n`, and returns `application/x-ndjson`. Bypass `ConvertingNotificationSerializer` (its `RepresentationConverter` has no NDJSON target).
   - Pinned IRIs (CSS vendored contexts `templates/contexts/{notification,activitystreams}.jsonld`):
     `id→@id`; `type→@type` = `https://www.w3.org/ns/activitystreams#<Type>`; `object`/`target` → `https://www.w3.org/ns/activitystreams#{object,target}` as `{ '@id' }`; `published` → `https://www.w3.org/ns/activitystreams#published` as `{ '@type': xsd:dateTime, '@value' }`; `state` → `http://www.w3.org/ns/solid/notifications#state` as `{ '@value' }`.
   - Notification shapes to cover: `ActivityNotificationGenerator` (`{id,type,object,state,published}`), `AddRemoveNotificationGenerator` (+`target`), `DeleteNotificationGenerator` (no `state`), and the initial `StateNotificationGenerator` notification sent through the same serializer.
4. **Emitter.** Thin custom `StreamingHttp2023Emitter` guaranteeing exactly one JSON object per line + `application/x-ndjson` (the stock emitter already writes whole chunks).
5. **Config.** New `sai:config/http/notifications/ndjson.json` overriding `urn:solid-server:default:StreamingHttp2023RequestHandler`, `…:BaseNotificationSerializer`, `…:StreamingHttp2023Emitter`, `…:StreamingHttpListeningActivityHandler`, `…:StreamingHttpNotificationHandler`; import it from `packages/components/config/{registry,data}.json` in place of relying on stock `css:config/http/notifications/streaming-http/http.json` values.

Start with expanded JSON-LD (as-is); a compacted form can follow later if needed.

### 5b. Client — NDJSON reader

- `packages/application/src/notification-manager.ts` `handleStream` and `test/util.ts` `awaitNotification`/`openNotificationStream`:
  - buffer across chunk boundaries, split on `\n`, `JSON.parse` per line, `toStore(doc)` (expanded → no context resolution);
  - **discard the first _line_** (the initial notification), not the first chunk;
  - dedupe the duplicated stream logic between the two files (existing TODO).
- Keep the emitted `notification` event detail shape `{ type, object }`.

### 5c. `examples/vuejectron`

No code change expected — it consumes only `NotificationManager`'s `notification` event (`examples/vuejectron/src/store/app.ts:73-83`, compares `AS.Update`). Verify it still works against the NDJSON stream and update only if the event detail changes.

### 5d. Verification

- Run services/css with the custom components; subscribe to a resource; assert `Content-Type: application/x-ndjson` and one self-contained expanded JSON-LD object per line (initial + one per change).
- `test/policy-engine.test.ts` (dagger) exercises `awaitNotification` end to end.

**Done when:** neither `notification-manager.ts` nor `test/util.ts` imports `parseTurtle`; CSS streams NDJSON; no `text/turtle` streaming path remains.

---

## Phase 6 — Delete the Turtle helpers (decision 4 = A)

1. Delete `packages/utils/src/turtle-parser.ts` and `packages/utils/src/turtle-serializer.ts`.
2. Remove `export * from './turtle-parser'` (`index.ts:1`) and `export * from './turtle-serializer'` (`index.ts:4`).
3. Delete `packages/utils/test/turtle-parser.test.ts`; delete `packages/utils/test/turtle-serializer-test.ts` (or rewrite via `toNQuads`/direct `Store` if any case still matters).
4. Migrate remaining fixture construction: `packages/utils/test/match.test.ts`, `packages/utils/test/sparql-update.test.ts` — via `parseJsonld`/`toStore` or direct `Store` + `DataFactory.quad`.
5. Bump `packages/utils/package.json` version to `1.0.0-rc.27` (internal `^1.0.0-rc.26` ranges still satisfy it).
6. Grep gate: `rg -n "parseTurtle|serializeTurtle" --glob '!**/node_modules/**' --glob '!**/dist/**'` hits only docs.

**Done when:** both files and their exports are gone; `npm run build` + `npm test` (turbo, packages) and the dagger `test/` suite pass.

---

## Phase 7 — Drop the `n3` dependency (decision 6)

**Replacements** (both already present transitively at `@rdfjs/dataset@1.1.1` / `@rdfjs/data-model@1.3.4` — declare as direct deps):

| Site | Now | Change |
|---|---|---|
| `utils/src/jsonld.ts` `toStore` | `new Store()` | `dataset()` from `@rdfjs/dataset`; return type `DatasetCore` |
| `utils/src/jsonld-parser.ts` `parseJsonld` | `new Store()` | same |
| `utils/src/match.ts` | `dataset.match(...)` | unchanged — `DatasetCore` has `match` |
| `authorization-agent/src/sparql.ts` `localSparqlTransport` | `new Store()` + `addQuads` | `dataset()` + add each quad |
| `authorization-agent/src/{access-description-set,authorization-agent}.ts` | `DataFactory` | `@rdfjs/data-model` |
| `components/src/{SaiPermissionsEngine,AdminSparqlHandler,HybridDataAccessor}.ts` | `Store`/`DataFactory` | `@rdfjs/dataset`/`@rdfjs/data-model` |
| `data-model/src/shape-tree.ts` | `DataFactory` | `@rdfjs/data-model` |
| package deps | `n3` + `@types/n3` in `utils`/`authorization-agent`/`data-model`/`components`/`application`/`test-utils` | remove — `application`/`test-utils` have **no** usage at all (only `application/README.md:79`) |
| tests | `DataFactory`/`Store`/`Parser` in `utils`/`authorization-agent`/`data-model`/`components` | `@rdfjs/*`; parsing via `jsonld.fromRDF` |

**Caveats:**
- `ReciprocalMirror`'s N3-only `getObjects` must be gone first (Phase 4).
- `data-model/test/framing/helpers.ts:18` parses a **TriG** fixture with `new Parser({ format: 'application/trig' })` — the only non-N-Quads parse left. Convert the fixture to JSON-LD or parse with `jsonld.fromRDF`; there is no non-N3 TriG parser in the tree.
- `fetch-sparql-endpoint` uses N3 internally — that is its dependency, not ours, and does not keep `n3` in our package manifests.

**Done when:** `rg -n "from 'n3'" packages --glob '!**/node_modules/**' --glob '!**/dist/**'` returns nothing; `n3`/`@types/n3` gone from every `package.json`; build + tests green.

---

## Verification

- Per phase: `npm run build` (turbo) + `npm test` (turbo, packages) green before and after; new pinning tests added first.
- `test/` integration workspace (dagger): re-run after each phase that touches it (2, 3, 5); final gate after Phase 6. Build first so workspace symlinks see updated `dist/`.
- Phase 5 server check: `application/x-ndjson`, expanded JSON-LD per line, initial notification + one per change, buffered reader survives chunk boundaries.
- Wire-format sanity: SPARQL `INSERT/DELETE DATA` bodies are N-Triples (default-graph) or N-Quads (mirror); Oxigraph/CSS parse them as Turtle/N-Quads data blocks. The `application/sparql-update` mapping (`environments/css/oxigraph.nginx.conf`, `nix/images/sai-oxigraph.nix`) is unchanged.

## Open questions

1. **`syncAdminAcr` rewrite mechanics.** Compacted/framed JSON-LD mutation of the `#fullAdminAccess` `acp:apply`/`acp:anyOf` blank-node subtrees is fiddlier than the current N3 `Store` scan. Spike during Phase 2; if it proves brittle, fall back to building the whole ACR doc from the fetched framed node plus the freshly computed controls.
2. **`ReciprocalMirror` `documentValues` semantics.** Document-wide predicate scan vs subject-scoped `frameNode` + `strs` on `reciprocalIri`. Pick during Phase 4.
3. **Compacted notification form.** Out of scope initially — expanded JSON-LD first; revisit only if payload size warrants.
