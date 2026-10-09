---
type: overview
title: Architecture overview
description: The sai-js monorepo, the Solid Application Interoperability specification it implements, its npm-workspace package layout, and the build/test tooling that ties the packages together.
tags: [architecture, monorepo, solid, typescript, overview]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T19:35:35.072Z
sources:
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-0d51e872e5313bf2bd32309c
    resource: repo://packages/application/package.json
  - id: openwiki-source-c223d917c8b42455af9ac175
    resource: repo://packages/authorization-agent/package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-b7181b4d7359d016a13b092d
    resource: repo://test/package.json
  - id: openwiki-source-440ae1e215cb02721dda855c
    resource: repo://turbo.json
  - id: openwiki-source-b6f224d26b4ec604e90101e3
    resource: repo://vitest.workspace.ts
generated: { by: "pi", at: "2026-10-09T19:35:35.072Z" }
---

# Architecture overview

`sai-js` is a TypeScript monorepo implementing the
[Solid Application Interoperability (SAI) specification](https://solid.github.io/data-interoperability-panel/specification/).
The root `package.json` is a private workspace named `interop` that groups the
packages under `packages/*`, the integration suite under `test`, and the docs
website under `docs/website`.

## Intended dependents

The two public, spec-facing modules are documented in the root `README.md`:

- **Solid Applications** — `@janeirodigital/interop-application` (`packages/application`), the top-level module for applications conforming to SAI.
- **Solid Authorization Agent** — `@janeirodigital/interop-authorization-agent` (`packages/authorization-agent`), the top-level module for authorization agents.

## Workspace layout

| Area | Path | Role |
| --- | --- | --- |
| `api-messages` | `packages/api-messages` | `@effect/rpc` + effect Schema wire contract between UI and service |
| `application` | `packages/application` | Client-side application module and grant traversal |
| `authorization-agent` | `packages/authorization-agent` | Agent-side module (registries, grants, authorizations) |
| `components` | `packages/components` | HTTP handlers, service layer, Temporal workflows/activities, worker |
| `data-model` | `packages/data-model` | JSON-LD POJO entities and ACR templates |
| `repl` | `packages/repl` | Command-line REPL/utility (seed, gen-jwk) |
| `test-utils` | `packages/test-utils` | Shared seeding/fixture helpers |
| `utils` | `packages/utils` | JSON-LD/Turtle/SPARQL/fetch primitives |
| services | `services/id`, `services/css`, `services/worker` | WebID/CID service, CSS instance configs, worker package |
| UI | `ui/authorization` | Vue authorization console |
| examples | `examples/plenary`, `examples/vuejectron` | Demo applications |
| shapetrees | `shapetrees` | Cloudflare shape-tree worker |
| environments | `environments/` | CSS configs, seed data, dev URL map |
| nix | `nix/` | NixOS/Podman production deployment |

The `data-model` package is the dependency-free anchor: `application` and
`authorization-agent` both depend on it, and it depends on neither of them (see
[Data model entities](../data-model/entities.md)).

## Build and test tooling

- **Turborepo** drives `build`, `test`, `clean`, and `dev` across workspaces.
  `test` depends on `build` and is never cached; `build` outputs to `dist/**`.
- **Vitest** is the unit/integration runner, configured per-package via
  `vitest.workspace.ts` (all `packages/*`).
- **Biome** is the linter/formatter (`npm run check`), with a root `biome.json`.
- TypeScript is configured through a shared `tsconfig.base.json`.

The two test layers are distinct: per-package unit tests under `packages/*/test`
run locally, while the Dagger-driven end-to-end suite under `test/` requires the
Dockerized service cluster (see [Integration test suite](../testing/integration-tests.md)).
