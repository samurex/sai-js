# Publish the interop libraries to JSR

> **Status:** 📋 not started — long-term goal. Extracted from
> `esm-jsr-no-build.md` (where it was Phase 6 and §6) so that plan can close out.
> The ESM-only / no-build / `.ts`-import groundwork it depends on is already
> landed there.

## Goal

Publish the 5 interop libraries (`interop-utils`, `interop-data-model`,
`interop-application`, `interop-authorization-agent`, `sai-api-messages`) to
[jsr.io](https://jsr.io) as **TypeScript source**. `@elfpavlik/sai-components`
stays on npm (D1) because of its `lsd:*` fields + generated descriptors.

## Decisions (moved from `esm-jsr-no-build.md`)

| # | Decision | Choice |
|---|---|---|
| D4 | JSR cross-package dependency specifiers | **A** — publish-time staging/rewrite to `jsr:@janeirodigital/*@<range>` (npm/Bun cannot install `jsr:` deps locally) |
| D6 | npm publishing | **A** — stop npm publishing for the 5 interop libs; keep npm for `components` (D1) |
| D7 | Slow types | **A** — fix `utils`/`authorization-agent`/`components`; `--allow-slow-types` for `api-messages` (C optional) |
| D8 | Publish trigger + version source of truth | GitHub Actions on `main` (JSR no-ops on unchanged versions), `package.json` as the source, generated `jsr.json` versions |

## Steps

1. **`jsr.json` per interop lib:**
   ```json
   {
     "name": "@janeirodigital/interop-utils",
     "version": "1.0.0-rc.27",
     "exports": { ".": "./src/index.ts" },
     "publish": { "include": ["src/**/*.ts", "README.md", "LICENSE"] }
   }
   ```
   (`.gitignore` already excludes `dist/`; `test/` must be excluded via
   `publish.exclude`/`include`.)
2. **Version sync script** (`package.json` → `jsr.json`).
3. **Fix slow types** (D7): `utils` (24), `authorization-agent` (3),
   `components` (14); `api-messages` (92, incl. 27
   `unsupported-super-class-expr`) → `--allow-slow-types`.
4. **Dependency staging** (D4 = A): stage each package with cross-deps rewritten
   to `jsr:@janeirodigital/*@<range>`.
5. **Publish order:** `utils` → `data-model` → `authorization-agent` →
   `application`, `api-messages`.
6. **`.github/workflows/publish-jsr.yml`** (OIDC; one-time per-package repo link
   on jsr.io).
7. **Prerequisite:** own/create the `@janeirodigital` scope on jsr.io.
8. Validate each with `npx jsr publish --dry-run --allow-dirty`.

## Evaluation evidence (already gathered)

- **JSR rules:** ESM-only; a `jsr.json` is mandatory (a `package.json` alone is
  rejected); sloppy imports are enabled at publish (`--unstable-sloppy-imports`);
  current package-name limit is **58** chars (the docs' "20" is outdated).
- **Slow-type violations:** `utils` 24 (14 missing explicit type, 10 missing
  return type), `authorization-agent` 3, `components` 14, `api-messages` 92
  (65 missing explicit type + 27 `unsupported-super-class-expr`), `data-model` 0,
  `application` 0.
- **Why JSR-only makes "publish TS source" safe for Node consumers:** JSR's
  npm-compat layer transpiles TS; that's why D10 (npm publishing) and JSR are
  coupled.
- **`components` stays npm** — Components.js `lsd:*` fields + generated
  `dist/components/*.jsonld`; JSR's npm-compat layer can't be assumed to
  preserve them.

### Consumer-side facts (from `jsr.io/docs/using-packages`)

- JSR packages are ESM-only and usable from Deno, Node, Bun, Cloudflare Workers,
  and Vite/esbuild/Webpack/Rollup.
- **Install form differs by package manager:**
  - `deno add`, **pnpm 10.9+**, **yarn 4.9+**: `"@luca/cases": "jsr:@luca/cases@^1.0.1"`.
  - **npm, Bun, older pnpm/yarn**: `"@luca/cases": "npm:@jsr/luca__cases@^1.0.1"`
    (scope `@luca` → `@jsr/luca`, `/` → `__`; e.g.
    `@janeirodigital/interop-utils` → `@jsr/janeirodigital__interop-utils`) plus a
    checked-in `.npmrc` line `@jsr:registry=https://npm.jsr.io`.
    For this repo, Bun/npm consumers would use the `npm:@jsr/...` alias + `.npmrc`,
    not `jsr:` (consistent with the probe that `jsr:` deps don't install under Bun).
- **`jsr add` appends a `.npmrc` that must be checked into source control.**
- **Semver ranges:** `@1`, `@1.0`, `@1.0.1`, `@^1.0.1`. Our versions are
  `1.0.0-rc.x` prereleases — validate the exact range during a staged dry-run.
- **Entrypoints** map 1:1 to `exports`; subpaths must be listed; a default `.`
  entrypoint is optional. Ours keep a single `.`.

## Gate

`npx jsr publish --dry-run --allow-dirty` succeeds for each package (slow types
resolved or waived), and a staged publish produces the expected dependency graph.
