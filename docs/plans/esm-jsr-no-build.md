# ESM-only, no build step, tsgo typecheck, JSR publishing

> **Status:** 📋 planning — **all active decisions resolved** (D1 ✅A, D2 ✅B,
> D3 ✅A, D5 ✅A, D9 ✅A, D10 ✅B; D4/D6/D7/D8 deferred with JSR). Evaluation done
> against the tree at the time of writing (no source changes yet). This plan
> tracks the move of the publishable packages to **ESM-only source with no build
> step**, running **everything under Bun** (native TS, incl. production OCI
> images), and type-checking with **`tsgo --noEmit`**
> (`@typescript/native-preview`).
>
> **JSR publishing is deferred** (decided during D4). It stays the long-term
> goal and is documented in §7 "Future work — JSR publishing (deferred)"; none of
> the phases below depend on it. For now the packages keep their npm names and
> npm dependency ranges.

## 1. Goal

1. **ESM-only.** Drop the dual CJS/ESM rollup output; packages are `"type": "module"` and expose TypeScript source.
2. **No build step** for the interop library packages (and, where feasible, everything else).
3. **Dev/test on Bun** loading `.ts` natively.
4. **Typecheck with `tsgo --noEmit`.**
5. **Publish packages to JSR** (`jsr.io`) instead of / alongside npm.

## 2. Current state (evidence)

### 2.1 Repo shape

- npm workspaces: `packages/*`, `test`, `docs/website`; Turbo orchestrates `build`/`test`/`dev`/`clean`.
- Publishable packages:
  - **5 interop libs** built by rollup (`@inrupt/base-rollup-config`) into dual CJS (`dist/index.js`) + ESM (`dist/index.mjs`): `interop-utils`, `interop-data-model`, `interop-application`, `interop-authorization-agent`, `sai-api-messages`.
  - **`@elfpavlik/sai-components`**: `tsc` + `componentsjs-generator`; Components.js `lsd:*` fields pointing at `dist/`.
  - private: `interop-repl`, `interop-test-utils`.
- `tsconfig.base.json`: `module: ESNext`, `moduleResolution: node` (node10), per-package `composite: true`, `outDir: dist`.
- Only `repl` and `test-utils` currently have `"type": "module"`.
- Relative imports are mixed: **139 with `.js` extension**, **189 extensionless**.
- No `jsr.json` anywhere; no JSR publish workflow; no changesets/release tooling.
- Each interop package already has `LICENSE` + `README.md`; `components` has neither.

### 2.2 Validated facts

| Fact | How verified |
|---|---|
| Bun resolves both `./x` and `./x.js` → `x.ts` | probe |
| `bunx --bun vitest run` passes existing tests | ran `packages/utils/test/link-header.test.ts` |
| Node **cannot** type-strip `.ts` in `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`) | probe on Node 24.21 |
| `tsgo` = `@typescript/native-preview` (bin `tsgo`); 7.0.0-dev | `npx tsgo --version` |
| `tsgo` removed `moduleResolution: node10` (`TS5108`) | ran on every package |
| `tsgo` defaults to **`strict: true`** | probe (`--strict false` clears the error) |
| JSR **requires `jsr.json`** (package.json alone rejected) | `jsr publish --dry-run` probe |
| JSR enables sloppy imports at publish (`--unstable-sloppy-imports`) | CLI invocation shown on error |
| JSR package name limit is currently **58** chars (docs' "20" is outdated) | `jsr.io/docs/packages` |
| npm + Bun cannot install `jsr:` dependency specifiers | Bun treats it as a git URL |
| Slow-type violations per package (see table below) | `jsr publish --dry-run --allow-dirty` |

### 2.3 `tsgo --noEmit` baseline (with `moduleResolution: bundler`)

| Package | errors |
|---|---|
| `utils` | 9 |
| `data-model` | 9 |
| `application` | 21 |
| `authorization-agent` | 11 |
| `sai-api-messages` | 0 |
| `components` | 68 |
| `test-utils` | 2 |
| `repl` | 1 |
| **total** | **~121** |

Most are strict-mode null/undefined issues (`TS2322`, `TS2532`, `TS18048`, …), i.e. surfaced by tsgo's `strict: true` default, not by the resolution change.

### 2.4 JSR slow-type violations

| Package | violations | notes |
|---|---|---|
| `utils` | 24 | 14 missing explicit type, 10 missing return type |
| `data-model` | 0 | dry run clean |
| `application` | 0 | dry run clean |
| `authorization-agent` | 3 | missing return type |
| `sai-api-messages` | 92 | 65 missing explicit type + **27 `unsupported-super-class-expr`** (`effect/Schema` class expressions) |
| `components` | 14 | missing explicit type |

### 2.5 Consumers affected by no-build

- `test/` integration tests import workspace packages + `@elfpavlik/sai-components`; they run under vitest (Bun-compatible), but the CSS/temporal services they talk to run under **Node** and consume built dist (`packages/components/dist/workers/main.js`, CSS `lsd:*`).
- `services/id` already runs `.ts` directly under Node with explicit `.ts` imports, but imports workspace packages that currently resolve to built dist.
- `docker-compose.yaml` and `.dagger/src/index.ts` hardcode `node` + `dist` paths.
- `ui/authorization` (Vite) and `docs/website` (Astro) handle TS `exports` fine.

### 2.6 The central tension

Node cannot load `.ts` from `node_modules`. Pointing package `exports` at `src/index.ts` therefore works for Bun and Vite, but **breaks every Node process** that imports those packages by name (CSS servers, Temporal worker, dagger services, production containers) unless they run under Bun or consume a transpiled build. This drives decisions D1 and D5.

## 3. Decisions

Each decision is listed with options, a recommendation, and a placeholder for the resolution. **Decisions are resolved one at a time before implementation starts.**

| # | Decision | Recommendation | Status |
|---|---|---|---|
| D1 | `@elfpavlik/sai-components` strategy | keep on npm with its build | ✅ **A** — keep on npm with its build |
| D2 | TypeScript strictness under tsgo | `strict: true` migration (~121 fixes) | ✅ **B** — pin `strict: false` now; **Phase 7** migrates to `strict: true` |
| D3 | Module/resolution mode + import extensions | `module: preserve` + `moduleResolution: bundler` + explicit `.ts` imports | ✅ **A** — `module: preserve` + `moduleResolution: bundler`; imports stay mixed; normalization deferred to **Phase 8** |
| D4 | JSR cross-package dependency specifiers | publish-time rewrite to `jsr:` | ✅ **deferred with JSR** — keep npm names/ranges for now |
| D5 | Production runtime for CSS/worker/services | pending D1 | ✅ **A** — Bun everywhere, including the production OCI images in `flake.nix` |
| D6 | npm publishing | keep npm for `components` only (per D1) | ⏸️ deferred with JSR |
| D7 | Slow types | fix utils/auth-agent/components; `--allow-slow-types` for `api-messages` | ⏸️ deferred with JSR |
| D8 | JSR publish trigger + version source of truth | GitHub Actions on release, `jsr.json`/`package.json` synced by script | ⏸️ deferred with JSR |
| D9 | Test runner under Bun | keep vitest, run via `bunx --bun` | ✅ **A** — keep vitest, run via `bunx --bun` |
| D10 | npm publish/release behavior while JSR is deferred | keep npm releases via a publish-time build; no build in dev/test | ✅ **B** — pause npm releases for the 5 interop libs; only `components` keeps publishing |

### D1 — `@elfpavlik/sai-components` strategy

**Context.** The package is not a normal library: CSS loads it through Components.js `lsd:components`/`lsd:contexts`/`lsd:importPaths` package.json fields, and `componentsjs-generator` needs compiled output to emit the per-class `dist/components/*.jsonld` descriptors. A run of the generator against `src/*.ts` produced only `components.jsonld`/`context.jsonld` (the per-class definitions, which carry `requireElement` metadata, are not produced), and JSR's npm-compat layer cannot be assumed to preserve `lsd:*`.

**Options**
- **A. Keep `components` on npm with its build** (`build:ts` + `build:components`) — everything else goes no-build. Lowest risk; documented exception.
- **B. Commit generated descriptors** — generate once, point `lsd:*` at committed files, treat as generated-but-checked-in. Still needs compiled JS for `requireName` unless runtime is Bun.
- **C. Programmatic CSS wiring** — replace declarative Components.js config with a TS CSS config loaded by Bun, dropping the descriptors. Largest refactor; upstream CSS shape must be supported.

**Recommendation:** A now; C as a possible follow-up if/when the whole server stack runs under Bun.

**Resolution:** ✅ **A** — `@elfpavlik/sai-components` keeps `build:ts` + `build:components`, its `dist/` + `lsd:*` fields, and stays an npm package. It is the sole build-step package. Revisit C only if CSS later runs under Bun.

### D2 — TypeScript strictness under tsgo

`tsgo` enforces `strict: true` by default, surfacing ~121 pre-existing errors.

**Options**
- **A. Migrate to `strict: true`** — fix the ~121 errors (mostly null/undefined guards). Cleanest long-term; largest diff.
- **B. Pin `strict: false` (+ `strictNullChecks: false`)** to preserve current behavior now; ratchet later.
- **C. Hybrid** — enable strict per package as it goes green (e.g. `api-messages` first, `components` last).

**Recommendation:** A for the 5 interop libs (they are the published surface), C for `components`; B as the fallback if the migration stalls.

**Resolution:** ✅ **B** — pin `"strict": false` (and `strictNullChecks: false`) in `tsconfig.base.json` so `tsgo --noEmit` matches today's behavior. `components` keeps its existing `tsc` pipeline (per D1). Migrating to **A** (`strict: true`, ~53 errors in the 5 libs + `test-utils`/`repl`; ~68 more in `components`) is deferred to **Phase 7**, to be tackled only after all other phases are complete and verified.

### D3 — Module/resolution mode + import extensions

`moduleResolution: node10` is gone in tsgo.

**Options**
- **A. `module: "preserve"` + `moduleResolution: "bundler"` + `allowImportingTsExtensions: true`** — matches Bun/Vite; accepts extensionless and `.js` imports.
- **B. `module`/`moduleResolution: "nodenext"`** — Node-correct; requires explicit extensions and `allowImportingTsExtensions`.
- Do we normalize all relative imports to explicit `.ts`? Mechanical (~145 files), needed for Node native TS, recommended by JSR, but not strictly required for Bun/JSR sloppy imports.

**Recommendation:** A, and normalize to explicit `.ts` as a separate mechanical step (enables Node native TS and removes ambiguity).

**Resolution:** ✅ **A** — `module: "preserve"` + `moduleResolution: "bundler"` + `allowImportingTsExtensions: true`. To keep the initial diff small, the existing mixed imports (`.js` + extensionless) are left as-is; `bundler` resolves all three. Normalizing every relative import to explicit `.ts` is deferred to **Phase 8** (same pattern as D2 → **Phase 7**).

### D4 — JSR cross-package dependency specifiers

`package.json` cross-deps are npm ranges. JSR resolves those to the **npm** registry; a JSR-native graph needs `jsr:` specifiers, which npm/Bun cannot install locally.

**Options**
- **A. Publish-time rewrite** — a script stages each package (temp dir) with cross-deps rewritten to `jsr:@scope/pkg@^x`, merges `jsr.json`, and runs `jsr publish`. Repo keeps npm ranges for local install.
- **B. Keep npm ranges** — JSR packages depend on the npm-published versions (dual publish). Simplest; registry graph stays mixed.
- **C. Drop npm publishing, use `jsr:` in package.json** — breaks local `npm install`/`bun install` (verified).

**Recommendation:** A (B as fallback).

**Resolution:** ✅ **Deferred with JSR publishing.** JSR is now a future goal, not part of this effort. The packages keep their npm names and npm dependency ranges. When JSR publishing is picked up, resolve this as **A** (publish-time staging/rewrite) — see §7.

### D10 — npm publish/release behavior while JSR is deferred

Surfaced by deferring JSR (D4): the interop libs become TS-source-only with no
`dist` in dev/test, but they are still `@janeirodigital/*` npm packages. A plain
`npm publish` would ship TS source, which Node consumers cannot load from
`node_modules`.

**Options**
- **A. Publish-time build only** — dev/test run source TS under Bun with no build;
  the `publish`/`prepublishOnly` script still builds `dist` (rollup or `tsc`)
  just for the npm tarball. "No build step" applies to the dev/test loop.
- **B. Pause npm releases** for the interop libs until JSR publishing lands.
  No build at all; `components` (D1) keeps building/publishing.
- **C. Publish TS-only to npm** — simplest pipeline, breaks Node consumers.
  Rejected.

**Recommendation:** A if there are external npm consumers that must keep
working; B if the packages are consumed only inside this repo until JSR.

**Resolution:** ✅ **B** — pause npm releases for the 5 interop libs until JSR
publishing lands. `@elfpavlik/sai-components` (D1) keeps its build + npm
releases. Consequences:

- The 5 interop libs have **no build and no publish script** — they are
  TypeScript source only.
- Anything that loads them from `node_modules` under **Node** breaks, because the
  package entry points at `src/index.ts` and Node cannot type-strip in
  `node_modules`. This includes `components`' emitted `dist/*.js`, the CSS
  servers, the Temporal worker, and the nix/production images. **This makes D5
  decisive** — see below.

### D5 — Production/Node runtime for CSS/worker/services

Depends on D1 and D10.

**Context.** With D10 = B, workspace interop packages are TS-only. Any Node
process that imports them by name from `node_modules` fails. Consumers:
`components`' built `dist/*.js` (imports interop), the CSS servers, the Temporal
worker, `services/id`, and the nix/production images. Local dev/test is fine on
Bun; the question is what the servers (and production) run.

**Options**
- **A. Run the Node-facing services under Bun** (CSS + Temporal worker +
  `components` workers) so they can load TS source/workspace packages. Needs a
  feasibility spike for `@solid/community-server` and `@temporalio/worker` under
  Bun; still needs the generated Components.js descriptors.
- **B. Consume frozen npm releases** for the servers/production — i.e. the last
  published (built) interop versions. Servers keep running under Node; they just
  do not see new interop code until JSR. Local dev of the interop libs is Bun-only.
- **C. Split dev vs production** — dev servers run under Bun on source; the
  production/nix images keep installing built npm releases (frozen per B).

**Recommendation:** C if Bun cannot cleanly run CSS/Temporal; otherwise A. B
alone is the floor (production frozen until JSR).

**Resolution:** ✅ **A** — Bun is the runtime everywhere: dev, test, and the
production OCI images built from `flake.nix`. There is no Node runtime story to
maintain. Implications:

- A **Bun feasibility spike** for `@solid/community-server` + the generated
  Components.js descriptors and `@temporalio/worker` is now a required early
  task (Phase 3). If either fails under Bun there is no fallback left, so this
  must be validated before the no-build cutover.
- The nix packages/images (`nix/packages/sai-*.nix`, `nix/images/sai-*.nix`)
  currently use `pkgs.nodejs` + `buildNpmPackage` against published npm deps and
  run built `dist`; they must be reworked to ship the repo source and use Bun
  (Phase 6).
- Production no longer depends on npm releases, which is consistent with
  D10 = B.

### D6 — npm publishing

> ⏸️ Deferred with JSR (D4) — superseded for now by **D10**. Kept for the JSR
> phase.

**Options**
- **A. Stop npm publishing for the 5 interop libs; keep npm for `components`** (D1).
- **B. Dual-publish everything** (npm + JSR).

**Recommendation:** A.

**Resolution:** ⏸️ deferred with JSR.

### D7 — Slow types

> ⏸️ Deferred with JSR (D4). See §7.

**Options**
- **A. Fix all fixable** (utils, authorization-agent, components) and use `--allow-slow-types` only for `api-messages`.
- **B. `--allow-slow-types` everywhere** for the first publish, fix later.
- **C. Refactor `api-messages`** away from `effect/Schema` class expressions so it can pass without the flag.

**Recommendation:** A; C as optional follow-up.

**Resolution:** ⏸️ deferred with JSR.

### D8 — JSR publish trigger + version source of truth

> ⏸️ Deferred with JSR (D4). See §7.

**Options**
- Publish on release/tag vs on every push to `main` (JSR no-ops if the version is unchanged).
- Version source: `package.json` vs `jsr.json` (JSR reads `jsr.json`; npm reads `package.json`); sync via a script.
- One-time per-package repo linking on jsr.io is required for OIDC.

**Recommendation:** GitHub Actions on `main` (JSR skips unchanged versions), `package.json` as the source, generated `jsr.json` versions.

**Resolution:** ⏸️ deferred with JSR.

### D9 — Test runner under Bun

**Options**
- **A. Keep vitest, run with `bunx --bun vitest`** (verified working).
- **B. Migrate to `bun test`** — tests import from `vitest`, so this needs a compatibility shim or a large rewrite.

**Recommendation:** A.

**Resolution:** ✅ **A** — keep vitest. **G1 runs via `bunx vitest run` (Node
runtime), which is green** (70/70 files). The Bun-runtime variant,
`bunx --bun vitest`, does **not** apply `vi.mock` — verified on the three files
that use it: `packages/components/test/grants.test.ts`,
`packages/components/test/invitation-activity.test.ts`,
`packages/authorization-agent/test/authorization-agent.test.ts` — and diverges on
env handling (missing `CSS_ENCODED_PRIVATE_JWK`). Making those files
Bun-runtime-compatible is deferred to **Phase 10**; then G1 can move to `--bun`.

## 4. Verification & phased implementation plan

> All active decisions are resolved; only the JSR-related ones are deferred.
> **Verification is the organizing principle:** the runtime switch must land
> before the no-build switch, so `dagger call test` stays runnable throughout.

### 4.1 Verification gates (run after every phase)

Prerequisites: workspace deps installed (`npm install`, so workspace symlinks are
in place) and — until Phase 4 — `packages/components/dist` built
(`npm run build:components`, or the full `npm run build`). G3 is user-run.

| Gate | Command | Notes |
|---|---|---|
| **G1 — unit tests** | `bunx vitest run` | Runs vitest under Node (`bunx` resolves the bin; `--bun` selects the Bun runtime). **Green: 70/70 files, 298 passed, 0 failed.** Not `bunx --bun` — see D9. |
| **G2 — typecheck** | `npx tsgo --noEmit -p packages/<pkg>/tsconfig.json` (or a root `typecheck` script) | Activates in **Phase 2**. Before that, the `tsc` build is the de-facto type gate. |
| **G3 — integration** | `dagger call test` | Runs `test/` against the CSS + worker + id services. Requires `packages/components/dist`. User-run. |

**Baseline (Phase 0):** on the current tree run `npm install`, `npm run build`,
then G1 and G3. `dagger call test` is already runnable *now* — the job here is to
keep it green while the tree changes.

### 4.2 Why this order

No-build only works where TS is loaded natively (Bun). So the **runtime switch
must land before package `exports` move to `src/*.ts`**. Phase 1 switches the
dagger/dev/test services to Bun while the interop packages are still built
(`dist` present), which is what lets `dagger call test` run under Bun early and
stay green through every later phase.

### Phase 0 — baseline (no changes)

- Run and record: `npm install && npm run build`; G1; G3 (`dagger call test`).
- Confirm the exact `dagger call test` invocation and any env it needs.

### Phase 1 — Bun runtime for dagger / dev / test (packages still built) — ✅ implemented

Goal: **G3 runs under Bun before any no-build change.**

- ✅ `.dagger/src/index.ts`: added `BUN_IMAGE = 'oven/bun:1.4.2-slim'` (glibc, to
  match the host `node_modules` + Temporal native addon) and switched every
  node service/test container to it:
  - CSS: `bun --preload=…/preload.cjs …/bin/server.js` (Node `--require` → Bun
    `--preload`).
  - worker: `bun --inspect=… /sai/packages/components/dist/workers/main.js`
    (dist still exists this phase).
  - id: `bun --preload=… services/id/https.ts`.
  - proxy: `bun /proxy.js`.
  - test/debug containers: `bun run dagger:test` / `dagger:debug`.
- ✅ `test/package.json`: `dagger:test` → `bunx --bun vitest run --no-file-parallelism`;
  `dagger:debug` → `bun --inspect-brk=0.0.0.0:9240 ../node_modules/vitest/vitest.mjs …`
  (the test suite has no `vi.mock`, so Bun runtime is safe here).
- ✅ `docker-compose.yaml`: auth/registry/data/worker/id → `oven/bun:1.4.2-slim`
  with Bun commands. `ui`/`vuejectron` (Vite dev servers) left on Node for now —
  not on the critical path.
- ✅ `packages/repl`: `cmd` → `bun ./cmd.ts`; dropped the `tsx` devDependency.
- ✅ G1 needed no hermetic env fix after all: `bunx vitest run` (Node runtime) is
  already 70/70 green with no manual env.
- Interop `dist` + rollup stay in place this phase.
- **Validated:** `npx tsc --noEmit -p .dagger/tsconfig.json` clean;
  `docker compose config` valid; G1 green; `bun packages/repl/cmd.ts --help` runs.
- ✅ **Bun/jose compatibility fix (found by G3):** under Bun, jose 5.x resolves
  its `"bun"` export condition to the **browser/WebCrypto** build. CSS's
  `CachedJwkGenerator` generates a key pair and exports the private key as a JWK;
  the WebCrypto build defaults `extractable: false` and cannot export Node
  `KeyObject`s, so it throws `non-extractable CryptoKey cannot be exported as a
  JWK` (observed as repeated `[ListeningActivityHandler]` webhook errors). Fix:
  `preload.cjs` now patches `Module._resolveFilename` **under Bun only**, scoped
  to `require('jose')` originating from `@solid/community-server`, redirecting it
  to that package's **node** build. Verified: `CachedJwkGenerator`
  `getPrivateKey`/`getPublicKey` succeed under Bun, Node is unaffected, and our
  own jose v6 usage is untouched. (Alternative if preferred later: wire
  `EnvJwkGenerator` for `urn:solid-server:default:JwkGenerator` on registry/data
  too — auth already does this.)
- ✅ **Test bug exposed by Bun's fetch:** `test/authorization.test.ts` sent a
  typo'd `ContentType` header instead of `Content-Type`. Node's fetch silently
  adds `Content-Type: text/plain;charset=UTF-8` for a string body, so CSS's
  `PostOperationHandler` accepted it; **Bun's fetch adds no `Content-Type`**, so
  CSS returned 400 (`POST requests require the Content-Type header`). Fixed the
  header to `Content-Type` (matches the other RPC calls).
- **Caveat for G3:** official `oven/bun` images may default to a non-root `bun`
  user; if a service fails writing to a mounted volume, add `user: root` in
  compose / `.withUser('root')` in the dagger containers.
- **Gate:** ✅ G1 green; ⏳ G3 (`dagger call test`) green under Bun — **user to run**.

### Phase 2 — tsgo typecheck setup (no runtime impact) — ✅ implemented

- ✅ `@typescript/native-preview@7.0.0-dev.20260707.2` devDep; root
  `typecheck` script: `tsgo --noEmit -p packages/<pkg>/tsconfig.json` for the 5
  interop libs + `test-utils` + `repl` (components excluded per D2 = B).
- ✅ `tsconfig.base.json`: `module: "preserve"`, `moduleResolution: "bundler"`,
  `allowImportingTsExtensions: true`, `noEmit: true`, `"strict": false`;
  dropped `declaration`/`declarationMap`/`sourceMap`/`removeComments`/
  `emitDecoratorMetadata`/`experimentalDecorators`/`noLib`.
- ✅ `components` and `test-utils` still emit, so they override
  `module: "esnext"`, `noEmit: false`, `allowImportingTsExtensions: false`.
- ✅ `packages/repl/tsconfig.json` fixed: it pointed at a non-existent `src/`
  (files are at the package root) — now `include: ["*.ts"]`.
- ✅ Fixed the pre-existing errors `tsgo` surfaced (all unrelated to strict):
  `utils/jsonld.ts` (`@types/jsonld` types `frame()`'s third arg as `Frame`, not
  `Options`), `authorization-agent/activity-registry.ts` (`ActivityData` union
  members without `target`; narrow with `'target' in activity`),
  `repl/cmd.ts` (string index into `mapPaths`).
- ✅ CI: added a `Typecheck` step before the build.
- **Validated:** `npm run typecheck` exit 0; G1 green; `npm run build -- --force`
  8/8 tasks OK (the rollup/tsc builds still work until Phase 3).
- **Gate:** ✅ G2 green; ✅ G1 unchanged; ⏳ G3 (`dagger call test`) — user to run.

### Phase 3 — ESM-only + no build (interop libs) — ✅ implemented

- ✅ Per lib (`utils`, `data-model`, `application`, `authorization-agent`,
  `api-messages`): `"type": "module"`; `main`/`types`/`exports` →
  `./src/index.ts` (dropped `module` + `require`/`import` conditions); removed
  `build`/`clean`/`publish` scripts; `files` → `["src/"]`; deleted the 5
  `rollup.config.mjs`; removed root `@inrupt/base-rollup-config` + `rollup`.
- ✅ Interop `tsconfig.json` simplified to `extends base` + `include: ["src"]`
  (dropped `composite`/`rootDir`/`outDir`; `data-model` keeps `typeRoots`).
- ✅ Removed stale interop `dist/` + `tsconfig.tsbuildinfo` — G1/G2 still green,
  proving nothing consumes them.
- **`turbo.json` unchanged (deviation from the draft):** `components` (D1) and
  `test-utils` still have build scripts, so the `build` task and root
  `npm run build` stay; interop packages are simply skipped by turbo. `test`
  keeps `dependsOn: ["build"]` so `test-utils` dist is produced.
- **Validated:** G2 exit 0; G1 70/70 files / 298 passed; `npm test` (turbo) 8/8;
  `npm run build -- --force` 3/3 (components + test-utils + docs-website) with no
  interop `dist`; `npm run check` green.
- **Gate:** ✅ G1 + G2 green; ⏳ G3 (`dagger call test`) — user to run.

### Phase 4 — components exception (keep build)

Per D1: keep `build:ts` + `build:components`, `dist` + `lsd:*`, npm publishing.
Confirm `tsc` still resolves the now-TS interop packages and that the generated
`dist/components/*.jsonld` is unchanged in shape.

- **Gate:** G1 + G3 green; `components` is still excluded from G2 (D2 = B).

### Phase 5 — production + consumer cleanup

- nix packages/images (`nix/packages/sai-*.nix`, `nix/images/sai-*.nix`) → Bun +
  repo source (drop `buildNpmPackage` against published npm `dist`).
- `services/id`, `ui/authorization`, `docs/website`, `README.md` dev
  instructions, `.dagger`, `docker-compose.yaml`.
- **Gate:** G1 + G2 + G3 green.

### Phase 6 — JSR publishing (deferred — future goal, not on the critical path)

> Deferred per D4. Documented in §6 below. Do not start as part of the current
effort.

- `jsr.json` per interop lib: `name`, `version`, `exports: { ".": "./src/index.ts" }`, `publish.include: ["src/**/*.ts","README.md","LICENSE"]` (excludes `test/`).
- Version sync script (`package.json` → `jsr.json`).
- Slow types (per D7); validate each with `npx jsr publish --dry-run --allow-dirty`.
- Dependency staging (per D4).
- Publish order: `utils` → `data-model` → `authorization-agent` → `application`, `api-messages`.
- `.github/workflows/publish-jsr.yml` (OIDC, per-package repo link).
- Prerequisite: own/create the `@janeirodigital` scope on jsr.io.

### Phase 7 — strict-mode migration (follow-up) — ✅ implemented (components still excluded)

- ✅ Flipped `tsconfig.base.json` to `"strict": true` (dropped the now-redundant
  `noImplicitAny`). The CI `Typecheck` step (added in Phase 2) now enforces it.
- ✅ Fixed all errors in the 5 interop libs + `test-utils` + `repl` (~50):
  - `utils`: guards for `discoverAuthorizationAgent`/`discoverStorageDescription`;
    `@types/jsonld` overload casts; `FramedNode.id` made required (the frame
    always has an id — `frameNode` now throws if not).
  - `data-model`: `frameNode` id invariant + `jsonld.expand` cast.
  - `application`: definite-assignment on bootstrap fields; guards for
    parent/child map lookups; `?? false` on `can*` grants; `DataOwnerData |
    undefined`.
  - `authorization-agent`: `null` → `undefined` for quad matchers; definite
    assignment on `webIdProfile`/`registrySet`; `findDataRegistration` now
    returns `DataRegistrationData | undefined` (matching its test); guards +
    `?? null`/`?? undefined`.
  - `test-utils`: cast the mock response object as a whole; `sql!` definite
    assignment.
- ⏸️ **`components` remains `strict: false`** (its own tsconfig override) — the
  ~68 errors are still deferred, as the plan allowed. Its `tsc` build is
  unaffected, and it stays out of the G2 gate.
- **Validated:** G2 exit 0; G1 70/70 / 298 passed; `npm run build -- --force`
  3/3; `npm run check` green.
- **Gate:** ✅ G1 + G2 green; ⏳ G3 (`dagger call test`) — user to run.

### Phase 8 — normalize relative imports to `.ts` (deferred follow-up)

Only start after Phases 1–5 are complete and verified (per D3).

- Codemod every relative import/export in the no-build packages to an explicit `.ts` extension (`.js` → `.ts`, extensionless → `.ts`).
- `components` can follow the same codemod even though it keeps its build.
- Verify with `tsgo --noEmit` + vitest; keep it a standalone mechanical commit so it is easy to review/revert.

### Phase 9 — extract Temporal code; shrink `components` to Components.js-only (deferred follow-up)

**Goal:** `packages/components` should contain only the minimum needed for
`componentsjs-generator` to emit `dist/components/*.jsonld`. Everything else
(above all the Temporal code) moves to dedicated packages.

**Audit (done while planning; re-verify when starting).** Registered Components.js
classes currently living in the package (keep): ActivityEvents,
ActivityWebhookHandler, ActivityWebhookStore, AdminPermissionReader,
AdminSparqlHandler, AgentIdHandler, ApiHandler, CustomWebIdStore, EnvJwkGenerator,
EventsHandler, GrantIssuanceHandler, GrantRevocationHandler, HybridDataAccessor,
InvitationHandler, NdjsonNotification, PostgresKeyValueStorage, ProxyAdminHandler,
ReciprocalWebhookHandler, ReciprocalWebhookStore, S3DataAccessor,
SaiAuthorizationManager, SaiPermissionsEngine, SessionManager,
UiPushSubscriptionStore — plus same-file helper classes the generator emits
(SessionAcquirer, HybridResourceStore, NdjsonNotificationSerializer,
NdjsonStreamingHttpRequestHandler, CompactedNotification, S3DataAccessorArgs,
SparqlStoreEntry, ClientIdHandler) and `config/`.

**Move to a new `packages/temporal-workflows`** (name e.g.
`@elfpavlik/sai-temporal-workflows`, private):

- `src/temporal/workflows/*` (7 files) — must stay isolated (`@temporalio/workflow`,
  `@temporalio/common`, pure data).
- `src/temporal/activities/*` (6 files) — Node-side; currently import
  `builders/*`, `services/ReciprocalMirror`, `ReciprocalWebhookStore`,
  `util/uriTemplates`.
- `src/temporal/client.ts` and `src/workers/main.ts` (the worker entrypoint the
  dagger/nix commands run).
- worker-only tracing: `src/tracing/otel-state.ts`; decide `tracing/preload.cjs`.

**Other non-component code to relocate (destinations to decide when starting):**

| Code | Used by | Suggested destination |
|---|---|---|
| `src/services/*` (route handlers + domain helpers; ~15 files) | `ApiHandler` (component) **and** activities (`services/ReciprocalMirror`) | new `packages/sai-services`, or fold into `@janeirodigital/interop-authorization-agent` — overlaps `components-tweaks.md` |
| `src/builders/*` (`sessionManager`, `accountLoginStorage`) | activities + component tests | same destination as `services/*` |
| `src/SelfIssuedSession.ts`, `src/SessionManager.ts` | `SessionManager` is a component; `SelfIssuedSession` is its glue | keep with components (or move to the services package if `SessionManager` stays thin) |
| `src/tracing/bootstrap.ts`, `src/tracing/effect-tracer.ts` | `index.ts`, `workers/main.ts`, `test/`, `services/id` | small shared `tracing` package/module |
| `src/tracing/preload.cjs` | dagger/compose CSS `--preload` | keep as the package's non-component preload, or move to the shared tracing location |
| `src/util/uriTemplates.ts` | components + activities | shared location if components keep needing it |
| `src/messages.ts` | **no importers found** in `src` | confirm dead code, delete |

**`src/index.ts`** is then reduced to component exports (drop
`./services/Account.js`, `./tracing/bootstrap.js`, `./util/uriTemplates.js` if they
move).

**Open decisions to resolve when starting** (this phase is why it is deferred):

1. Destination of shared services/builders/tracing: a new package vs moving into
   `interop-authorization-agent` (coordinate with `components-tweaks.md`, which
   already plans to move residual SAI domain logic to the AA).
2. Whether `temporal-workflows` is private (likely) and whether it affects the
   JSR plan.
3. Whether `config/` still needs to live in `components` (yes, Components.js
   configs must ship with the descriptors) and how the lsd `importPaths` change.

**Gate:** G1 + G3 green, and `componentsjs-generator` output is unchanged —
diff `dist/components/*.jsonld` before/after (only expected path changes).

### Phase 10 — Bun-runtime vitest compatibility (deferred follow-up)

Only needed if/when G1 should run on the **Bun runtime** (`bunx --bun vitest`)
instead of the current Node runtime (D9). `vi.mock` is currently not applied by
Bun-runtime vitest; the three affected files are
`packages/components/test/grants.test.ts`,
`packages/components/test/invitation-activity.test.ts`, and
`packages/authorization-agent/test/authorization-agent.test.ts`.

- Refactor those to dependency injection / `vi.spyOn` (no module interception),
  or bump vitest once Bun-runtime mocking is supported.
- **Gate:** `bunx --bun vitest run` green (0 failures), then switch the G1 command.

## 5. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Bun cannot run CSS / Temporal worker | would block the entire runtime story (no Node fallback after D5=A) | ✅ **spike passed** (§8); residual: see §8 caveats |
| `api-messages` slow types | JSR publish blocked (future) | D7 — `--allow-slow-types` |
| JSR npm-compat drops `lsd:*` | `components` unusable from JSR | D1 — keep `components` on npm |
| 121 strict errors | large diff, schedule risk | D2 — hybrid or pin non-strict |
| Version divergence `package.json` vs `jsr.json` | wrong publish | D8 — sync script + CI check |
| Pre-release semver ranges (`^1.0.0-rc.x`) | dependency resolution surprises | validate with a staged dry-run publish |

## 6. Future work — JSR publishing (deferred)

Long-term goal: publish the interop libraries to JSR as TypeScript source. The
evaluation for this is already done and recorded above (slow-type counts, name
limits, `jsr.json` requirements, sloppy imports, npm-compat cachets). Keep in
mind:

- **D4 as A** — stage each package with cross-deps rewritten to
  `jsr:@janeirodigital/*@<range>` (npm/Bun cannot install `jsr:` deps locally).
- **Slow types** — fix `utils` (24), `authorization-agent` (3), `components`
  (14); `api-messages` (92, incl. 27 `unsupported-super-class-expr`) likely
  needs `--allow-slow-types`.
- **`jsr.json`** per package + version sync; publish order `utils` →
  `data-model` → `authorization-agent` → `application`, `api-messages`.
- **`components` stays npm** (D1) because of `lsd:*` + generated descriptors.
- **Publish trigger** — GitHub Actions + OIDC; one-time per-package repo link;
  create/own the `@janeirodigital` scope.
- **Prerequisite for Node consumers** — JSR's npm-compat layer transpiles TS, so
  JSR-only publishing is what makes "publish TS source" safe for Node consumers;
  this is also why D10 (npm publishing) and JSR are coupled.

### Consumer-side facts (from `jsr.io/docs/using-packages`)

Captured so the future publishing/consumer phases don't re-derive them:

- JSR packages are ESM-only and usable from Deno, Node, Bun, Cloudflare Workers,
  and Vite/esbuild/Webpack/Rollup.
- **How consumers install differs by package manager** (important for this repo,
  which uses npm workspaces + Bun):
  - `deno add`, **pnpm 10.9+**, **yarn 4.9+**: dependency entry is the direct
    specifier — `"@luca/cases": "jsr:@luca/cases@^1.0.1"`.
  - **npm, Bun, older pnpm/yarn**: dependency entry is an aliased npm form —
    `"@luca/cases": "npm:@jsr/luca__cases@^1.0.1"` — where the JSR scope
    `@luca` becomes `@jsr/luca` and the `/` becomes `__`
    (e.g. `@janeirodigital/interop-utils` → `@jsr/janeirodigital__interop-utils`),
    plus a checked-in `.npmrc` line `@jsr:registry=https://npm.jsr.io`.
    For this repo that means **Bun/npm consumers of our JSR packages would use
    the `npm:@jsr/...` alias + `.npmrc`**, not `jsr:` (consistent with the
    earlier probe that `jsr:` deps don't install under Bun).
- **`jsr add` appends a `.npmrc` that must be checked into source control** —
  without it later `npm install`/`bun install` cannot resolve `@jsr/*`.
- **Semver ranges**: `@1` (major only), `@1.0`, `@1.0.1` (exact), `@^1.0.1`
  (allow updates) all work in `jsr:` / package.json dependency entries. Our
  versions are `1.0.0-rc.x` prereleases — validate the exact range (e.g.
  `^1.0.0-rc.27`) during a staged dry-run.
- **Entrypoints** map 1:1 to the config `exports`; subpaths are importable only
  if listed (`jsr:@std/path@1/join` → `@std/path/join`). Packages without a
  default `.` export require an explicit entrypoint. Ours keep a single `.`
  export.
- `bunx jsr add`/`npx jsr add` is the install path for Bun/npm; it writes the
  `@jsr` alias entry and `.npmrc` for you.

## 7. Appendix — validation commands

```sh
# G1 — unit tests under Bun (root, workspace = packages/*)
bunx --bun vitest run

# G2 — typecheck (activates in Phase 2)
npx -y -p @typescript/native-preview tsgo --noEmit -p packages/utils/tsconfig.json

# G3 — integration (user-run; needs packages/components/dist built)
npm run build -w @elfpavlik/sai-components   # or, until Phase 3: npm run build
dagger call test

# Bun native TS
bun packages/repl/cmd.ts --help

# JSR dry run for one package (after adding jsr.json)
cd packages/utils && npx -y jsr@latest publish --dry-run --allow-dirty
```

## 8. Bun feasibility spike results (D5 = A) — ✅ passed

Run against the tree at planning time (Bun 1.4.2, no source changes).

| Probe | Result |
|---|---|
| `@temporalio/worker` native core bridge under Bun | ✅ loads; `NativeConnection.connect('127.0.0.1:7233')` reaches TCP (`ECONNREFUSED` with no server) — N-API addon works |
| `bundleWorkflowCode({ workflowsPath: …/temporal/workflows/grants.ts })` under Bun | ✅ webpack 5.111.1 compiled a 1.67 MB bundle; works directly on **TypeScript source** |
| `@elfpavlik/sai-components` (built `dist`) import under Bun | ✅ 42 exports loaded |
| CSS `bin/server.js` under Bun, default `@css:config/file.json` | ✅ booted; `GET /` → **HTTP 200** |
| CSS + repo `environments/css/auth.json` (SAI components) under Bun | ✅ Components.js discovered 292 packages / registered 1176 components, instantiated the SAI component graph; stopped only at `PostgresKeyValueStorage` → `ECONNREFUSED 127.0.0.1:5432` (no local Postgres), with the stack trace going through `packages/components/dist/PostgresKeyValueStorage.js` |

**Caveats / follow-ups (not blockers):**

- `oidc-provider` prints `WARNING: Unsupported runtime. Use Node.js … LTS` under Bun. It is a soft warning and CSS still booted; watch it for OIDC flows.
- The dagger/compose commands use Node's `--require=…/tracing/preload.cjs`; Bun has no `--require` (use `--preload`). Phase 6.
- The spike did not run a live Temporal server or a full authenticated CSS flow; the external services (Postgres/SPARQL/garage/Temporal) were not started.
- Bun was validated; `bun test` vs vitest is still D9 = A (vitest under Bun).
