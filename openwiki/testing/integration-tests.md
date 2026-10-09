---
type: testing
title: Integration test suite
description: The Dagger-driven integration suite — seeded environments/data, per-test re-seed, the waitForQuiescence/awaitGrantCompletion race-prevention helpers, and what each test file verifies.
tags: [testing, dagger, vitest, integration, race-prevention]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T19:35:35.072Z
sources:
  - id: openwiki-source-a8a954b9de2bc6c0b4ca5044
    resource: repo://.dagger/src/index.ts
  - id: openwiki-source-6028df227cf0c5e36d839191
    resource: repo://environments/data/registry.trig
  - id: openwiki-source-900a2d8c960b090aaf5dc614
    resource: repo://temporal/dynamicconfig/development-sql.yaml
  - id: openwiki-source-b7181b4d7359d016a13b092d
    resource: repo://test/package.json
  - id: openwiki-source-11c141224a72985968f722ac
    resource: repo://test/setup.ts
  - id: openwiki-source-44922de4c3997ca2d1d53cd9
    resource: repo://test/util.ts
generated: { by: "pi", at: "2026-10-09T19:35:35.072Z" }
---

# Integration test suite

The `test/` workspace drives end-to-end verification against a real Dockerized
cluster (auth/registry/data/worker/temporal/sparql/garage), not mocks. It runs
under **Dagger** via `npm run dagger:test` =
`vitest run --no-file-parallelism`, so one test file runs at a time in the test
container.

## Dagger pipeline

`.dagger/src/index.ts` defines the `SaiJs` object with service factories
(`postgresService`, `oxigraphService`, `sparqlService`, `garageService`,
`temporalService`, `workerService`, `idService`, `authService`,
`registryService`, `dataService`) and a `testBase()` that assembles a node
container mounting the repo at `/sai`, binding every service by hostname, and
setting env (TLS off, `CSS_SPARQL_ENDPOINT`, `TEMPORAL_ADDRESS`). The `test`
pipeline function runs `vitest run --no-file-parallelism`. `test/proxy.js`
forwards local ports to the debug services.

## Seed and per-test reset

`environments/data/registry.trig` is the quadstore seed (every party's
RegistrySet, registrations, ACRs, and the Alice↔Kim reciprocal pair and YoYo
admin marker reused by tests), and `environments/data/kv.json` seeds CSS's
Postgres key-value store with accounts, cookies, and pre-wired
`activityWebhook`/`reciprocalWebhook` channels. `test/setup.ts` re-seeds both
(`pg.seedKeyValue` + `seedQuadstore`) in a `beforeEach` — every test starts
from the pristine seed, wiping leftover state and pending activities — and
puts/deletes the client-id document in Garage in `beforeAll`/`afterAll`.

## Race prevention

`test/util.ts` owns the barriers that make the async workflow machinery
deterministic:

- `waitForQuiescence(webIds)` — waits until none of the webIds has pending
  activities (registry entries without a matching completion) for two
  consecutive polls; a transient registry 500 counts as unsettled.
- `awaitGrantCompletion(authFetch, registrationId, webIds, trigger)` — the
  listen-first barrier: open the registration notification stream, run one
  RPC trigger, await the registration `Update`, then wait for quiescence
  (the `Update` fires mid-chain, before the parent workflow's completion tail).
- Category-specific `waitFor*Completion` helpers wait for the matching
  completion activity, and `openNotificationStream`/`openEventsStream` open
  listen-first streams (no replay).

Temporal retries are off in the dev config (`maximumAttempts: 1`), so failures
are one-shot.

## Coverage

Each file verifies one protocol surface: `access-request.test.ts` (need-based
requests), `admin-events.test.ts` (org-admin activity forwarding),
`agent-discovery.test.ts` / `discovery.test.ts` (Link-header discovery),
`authorization.test.ts` (authorization + approval), `delegation-endpoint.test.ts`
(issuance/revocation), `invitation.test.ts` (personal + org invitation),
`org-context.test.ts` (admin org context + proxy/sparql-admin),
`personal-admin.test.ts` (AddAdmin/RemoveAdmin + ACR),
`policy-engine.test.ts` (WAC/ACP matrix), `reciprocal-webhook.test.ts`,
`reconciliation.test.ts` (sweep), `revocation-rpc.test.ts`, `roles.test.ts`,
`services.test.ts` (reachability smoke), and `share.test.ts`. The isolation
details and residual limits are documented in `docs/tests.md`.
