# Production + consumer cleanup (Bun, no-build TS)

> **Status:** 📋 not started. Extracted from `esm-jsr-no-build.md` (where it was
> Phase 5) so that plan can close out.

## Goal

Make the production images and the remaining consumers run the **no-build
TypeScript source under Bun**, consistent with the decisions already landed in
`esm-jsr-no-build.md`:

- **D5 = A** — Bun is the runtime everywhere (dev, test, **production OCI
  images**).
- **D10 = B** — the 5 interop libs have no build/`dist` and npm releases are
  paused; `@elfpavlik/sai-components` (D1) keeps its build + npm publishing.
- Node cannot type-strip `.ts` in `node_modules`, so any Node process that
  imports the workspace interop packages by name fails — the fix is to run under
  Bun.

## Work items

### nix packages/images (`nix/packages/sai-*.nix`, `nix/images/sai-*.nix`)

They currently use `pkgs.buildNpmPackage` + `pkgs.nodejs` and run built `dist`
against published npm deps. Rework them to ship the repo source and use Bun:

- `sai-css.nix` — runs `@solid/community-server/bin/server.js` (via
  `makeWrapper ${pkgs.nodejs}`). Switch to Bun; the CSS services already run
  under Bun in dagger/compose (Phase 1).
- `sai-worker.nix` — runs
  `@elfpavlik/sai-components/dist/workers/main.js`. Switch to Bun and the worker
  entrypoint; note the worker currently lives in `components` — the
  `extract-temporal-workflows.md` plan may move it.
- `sai-id.nix` — runs `http.ts` (already TS).
- `sai-ui.nix` — builds the Vite UI `dist` (leave as a build unless the UI is
  also moved to Bun-native).
- `nix/images/sai-*.nix` — replace `pkgs.nodejs` with Bun and update `Cmd`s.
- `flake.nix` — image `paths`/`nativeBuildInputs`.

### Services / consumers

- `services/id` — runs `.ts` under Node today; run under Bun (it imports the
  TS-only interop packages).
- `ui/authorization` — depends on `@janeirodigital/sai-api-messages` via
  `file:`; Vite handles the `.ts` exports, but verify the `vue-tsc` build and
  the dev server.
- `docs/website` — check nothing imports interop packages.
- `README.md` — update the dev instructions (`npm run build` no longer needed
  for the interop libs; `dagger call test` needs `packages/components/dist`).
- `.dagger` / `docker-compose.yaml` — already switched to Bun in
  `esm-jsr-no-build.md` Phase 1; the only remaining Node holdouts are the Vite
  dev servers (`ui`, `vuejectron`) and the dagger `ping()` helper (intentional).
- `--require` → `--preload`: done for dagger/compose; ensure any nix image
  command lines use Bun's `--preload` for `tracing/preload.cjs`.

## Gate

G1 + G2 + G3 green:

- `bunx --bun vitest run`
- `npm run typecheck`
- `npm run build -w @elfpavlik/sai-components` + `dagger call test`
