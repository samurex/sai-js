# Drop the `n3` dependency

> **Status:** ⬜ not started.
>
> **Goal.** Remove `n3` (and `@types/n3`) from every package manifest, replacing its two roles:
> - **N3 `Store`** (an RDF/JS `DatasetCore`) → `@rdfjs/dataset` (the reference `DatasetCore` implementation), or a plain quad array where the value is only iterated;
> - **N3 `DataFactory`** → `@rdfjs/data-model`.
>
> **Why.** `n3` remains only for `Store` and `DataFactory`. The Turtle `Parser`/`Writer` usages are already gone (see the completed Turtle-removal work), so what is left is a general-purpose RDF/JS implementation that the codebase can get from the spec-aligned `@rdfjs/*` packages. Both replacements are already present transitively in the tree (`@rdfjs/dataset@1.1.1`, `@rdfjs/data-model@1.3.4`), so this is a manifest/import change, not a behavior change.
>
> **Context.** This was originally the final phase of the "remove Turtle serialization" plan; it is a distinct, repository-wide refactor and is tracked separately here.

---

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | `Store` replacement | `@rdfjs/dataset` (`dataset()`, `DatasetCore`). `match()`/`size`/iteration are part of `DatasetCore`; N3-only extensions (`getObjects`) must already be gone. |
| 2 | `DataFactory` replacement | `@rdfjs/data-model` (`namedNode`, `literal`, `quad`, …). |
| 3 | Quad-array collectors | Where a `Store` is only used to collect a stream and then convert (`jsonld.fromRDF`, `addQuads`), pass the quad array directly and skip the dataset entirely. |
| 4 | Declaration | Add `@rdfjs/dataset` / `@rdfjs/data-model` as direct deps where imported; remove `n3` + `@types/n3` from all manifests. |

`@rdfjs/types` (types only) stays.

---

## Current footprint (authoritative)

### Production `from 'n3'`

| Site | Uses |
|---|---|
| `packages/utils/src/jsonld.ts:333` (`toStore`) | `new Store()` |
| `packages/utils/src/jsonld-parser.ts:23` (`parseJsonld`) | `new Store()` |
| `packages/authorization-agent/src/sparql.ts:77` (`localSparqlTransport`) | `new Store()` + `addQuads` |
| `packages/authorization-agent/src/access-description-set.ts:20` | `DataFactory.namedNode` / `DataFactory.literal` |
| `packages/data-model/src/shape-tree.ts:13` | `DataFactory.namedNode` |
| `packages/components/src/SaiPermissionsEngine.ts:18` | `new Store([...data])` (4 sites) |
| `packages/components/src/HybridDataAccessor.ts:19-20` | `type Quad`, `DataFactory as DF` |

`packages/application/README.md:79,85` mentions `n3` in an example — update the prose.

### Test `from 'n3'` (10 files)

`utils/test/{jsonld-parser,match}.test.ts`; `components/test/grants.test.ts`; `authorization-agent/test/{write-paths,get-role,authorization-agent,store-data-authorizations}.test.ts`; `data-model/test/framing/helpers.ts`, `data-model/test/pojo/{data-grant,data-authorization}.test.ts`.

### Manifests

- `n3`: `utils`, `test-utils`, `data-model`, `components`, `authorization-agent`, `application`.
- `@types/n3`: `utils`, `test-utils`, `data-model`, `authorization-agent`, `application` (not `components`).
- **`application` and `test-utils` have no `n3` usage at all** — only `application/README.md` — so their deps can be dropped first.

### Caveats

- **`Store.getObjects` must already be gone.** It was N3-only and used by `ReciprocalMirror`; the Turtle-removal work replaced it with `documentValues`, so nothing in `src` uses it now (verify before starting).
- **`data-model/test/framing/helpers.ts:18` parses a TriG fixture** with `new Parser({ format: 'application/trig' })` — the only non-N-Quads parse left. There is no non-N3 TriG parser in the tree: convert the fixture to JSON-LD, or parse it via `jsonld.fromRDF` (N-Quads/N-Triples), or move the fixture to `test-utils` behind an existing RDF parser. Decide before deleting `n3`.
- **`fetch-sparql-endpoint` uses N3 internally** (its `fetchTriples` pipes through an N3 `StreamParser`). That is its dependency, not ours, and does not keep `n3` in our manifests.
- **`@rdfjs/dataset` / `@rdfjs/data-model` are only transitive today** — add them as direct deps in the packages that import them (check whether they belong in `dependencies` vs `devDependencies`; both are runtime values for `dataset`/`data-model`).

---

## Steps

Order so each step stays green (`npm run build` + `npm test`, turbo):

1. **Drop dead manifests.** Remove `n3`/`@types/n3` from `application` and `test-utils`; fix `application/README.md`.
2. **`utils`.** Replace the two `new Store()` sites (`toStore`, `parseJsonld`) with `dataset()` from `@rdfjs/dataset`; `toStore`/`parseJsonld` keep their `DatasetCore` return type. `match.ts` is unchanged (`DatasetCore.match`). Migrate `utils/test/{jsonld-parser,match}.test.ts` off N3. Declare `@rdfjs/dataset`; drop `n3`/`@types/n3`.
3. **`authorization-agent`.** `sparql.ts` `localSparqlTransport` — collect the `fetch-sparql-endpoint` quad stream into `dataset()` (or return the quad array where only `jsonld.fromRDF` follows). `access-description-set.ts` — `DataFactory` → `@rdfjs/data-model`. Migrate the four test files. Drop `n3`/`@types/n3`.
4. **`data-model`.** `shape-tree.ts` `DataFactory` → `@rdfjs/data-model`. Resolve the TriG-fixture caveat and migrate `data-model/test/**`. Drop `n3`/`@types/n3`.
5. **`components`.** `SaiPermissionsEngine.ts` `new Store([...data])` → `dataset(data)`; `HybridDataAccessor.ts` `DataFactory`/`Quad` → `@rdfjs/data-model` / `@rdfjs/types`. Migrate `components/test/grants.test.ts`. Drop `n3`.
6. **Grep gate.** `rg -n "from 'n3'" packages --glob '!**/node_modules/**' --glob '!**/dist/**'` returns nothing; no `n3`/`@types/n3` in any `package.json` (except transitive).

---

## Verification

- Per step: `npm run build` (turbo) + `npm test` (turbo, packages) green.
- Behavior parity: the `@rdfjs/dataset`/`@rdfjs/data-model` swap must not change produced triples — existing tests (JSON-LD framing, match, permissions engine, SPARQL transport) are the guard; add a focused test if a `Store`-specific method is replaced.
- Final: the dagger `test/` suite (it mounts the host repo, so it exercises the swapped implementations end to end).

## Open questions

1. **TriG fixture** (`data-model/test/framing/helpers.ts`) — convert to JSON-LD vs. keep one non-runtime TriG parse behind `@rdfjs/parser-n3` (which still depends on `n3`, defeating the goal) vs. relocate the fixture. Resolve before step 4.
2. **`toStore` vs. doc-only** — whether `toStore`/`parseJsonld` should keep returning a `DatasetCore` at all, or be narrowed further to JSON-LD-document flows. Keep `DatasetCore` initially (minimal change).
3. **`@rdfjs/dataset` v1 vs v3** — the tree has `1.1.1`; confirm the API surface (`dataset()`, `DatasetCore`) matches usage before pinning.
