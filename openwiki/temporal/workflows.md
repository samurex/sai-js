---
type: architecture
title: Temporal workflows and activities
description: The Temporal client and worker bootstrap, the three task queues (create-grants, reciprocal-registration, forward-to-push), the workflow/activity catalog, and how activities call back into the service layer.
tags: [temporal, workflows, activities, worker, architecture]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T19:35:35.072Z
sources:
  - id: openwiki-source-a3ebe61b7dbf9a95d1051312
    resource: repo://packages/components/src/temporal/activities/grants.ts
  - id: openwiki-source-e04884959e0812782a6d49fe
    resource: repo://packages/components/src/temporal/client.ts
  - id: openwiki-source-03c71d0f7eed5c1f113d08e3
    resource: repo://packages/components/src/temporal/workflows/grants.ts
  - id: openwiki-source-23ba2a7bbe5efb6e2d77954d
    resource: repo://packages/components/src/workers/main.ts
generated: { by: "pi", at: "2026-10-09T19:35:35.072Z" }
---

# Temporal workflows and activities

Asynchronous work runs on Temporal. The client is bootstrapped per HTTP request
and the worker is a long-lived process inside the `components` package.

## Bootstrap

`packages/components/src/temporal/client.ts` defines the `Temporal` class whose
`init()` lazily opens a `Connection` to `TEMPORAL_ADDRESS` and builds a
`Client` (with an optional `OpenTelemetryPlugin`). Each HTTP handler constructs
a `new Temporal()` per request rather than pooling connections.

`packages/components/src/workers/main.ts` is the worker entrypoint: it connects
with an infinite 500 ms retry, initializes tracing (`sai-worker`), registers
three `Worker.create` instances, runs them concurrently, then shuts down OTel
and the connection. The `services/worker` package is only a skeleton; the
deployed entry is `packages/components/dist/workers/main.js` run by the Compose
`worker` service.

## Task queues

The three queues are inline string literals (no exported constants), repeated
by the producers in `ActivityWebhookHandler` and the grant handlers:

- `create-grants` — the main queue; hosts the `create-grants.ts` barrel
  (grants + admin + invitation + access-request workflows) and registers all
  four activity sets.
- `reciprocal-registration` — `reciprocal.ts` workflows, registering
  reciprocal **and** grants activities (because `establishReciprocal` calls
  `markActivitiesDone`).
- `forward-to-push` — `forward-to-push.ts` and the push activity.

## Workflow catalog

- `grants.ts` — `storeGrant`, `revokeGrants`, `processGranteeActivities` (a
  start-or-signal consumer), `createGrantsForAuthorization`,
  `processAuthorizationGranted`, `processGranteeAuthorization`,
  `updateDelegatedGrants`, `createRole`, `processRoleMembershipChange`,
  `processRoleDeletion`, `reconcileActivities`, and `createGrantsForAgent`.
- `admin.ts` — `createAdminGrants`, `revokeAdminGrants`, `syncAdminAcr`, and
  the `processAdminAuthorizationGranted/Revoked` orchestrators.
- `invitation.ts` — `createInvitation`.
- `reciprocal.ts` — `establishReciprocal`, `acceptInvitation`,
  `syncReciprocalMirror` (with its own retry policies).
- `access-request.ts` — `processNeedBasedAccessRequest`,
  `processNeedBasedAccessRequestReceived`, `detectGrantedRequests`.
- `forward-to-push.ts` — `sendPushNotifications`.

## Activities and the service layer

Every activity lazily resolves a session via
`buildSessionManager().getSession(webId)` and then calls the
authorization-agent / service APIs (`findAffectedGrantees`,
`generateDataGrants`, `RoleRegistry.updateRole`, `ActivityRegistry.createCompletion`, …).
Activities are deliberately find-first idempotent (`If-None-Match: *` PUTs,
404-tolerant deletes) so retries and `reconcileActivities` are safe. A CSS
SPARQL-backend `dcterms:modified` race forces serialized loops instead of
`Promise.all`. The ordering invariant is activity-first: an activity is marked
done only after all derived work succeeds.

The activity→workflow dispatch mapping lives in
[Activity outbox and events pipeline](../services/activity-lifecycle.md); the
flows each workflow realises are drawn in
[Sequence and discovery flows](../temporal/sequence-views.md).
