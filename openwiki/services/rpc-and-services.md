---
type: architecture
title: RPC contract and service layer
description: The @effect/rpc + effect Schema contract in api-messages, the ApiHandler entrypoint, personal-versus-org context resolution, and what each component service owns.
tags: [rpc, effect, services, architecture, typescript]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T19:35:35.072Z
sources:
  - id: openwiki-source-39263cf4b989bfbe674c72c0
    resource: repo://packages/api-messages/src/effect.ts
  - id: openwiki-source-92862eeddb750415b0a0a89f
    resource: repo://packages/components/src/ApiHandler.ts
  - id: openwiki-source-452244fad48fe4fdb39195dd
    resource: repo://packages/components/src/services/Context.ts
  - id: openwiki-source-20e9ce588a1e0e4469c2c993
    resource: repo://packages/components/src/services/RoleRegistry.ts
generated: { by: "pi", at: "2026-10-09T19:35:35.072Z" }
---

# RPC contract and service layer

The UI talks to the SAI backend through a single `@effect/rpc` endpoint. The
wire contract lives in `packages/api-messages` and is shared verbatim by the
browser client and the server; the server side (`packages/components`) routes
each request through a thin handler into a per-domain service.

## The contract (`api-messages`)

`packages/api-messages/src/effect.ts` declares every operation as an
`S.TaggedRequest` (`GetWebId`, `CheckHandle`, `BootstrapAccount`,
`AuthorizeApp`, `ShareResource`, `AddAdmin`, …) with effect Schema payload and
success types, and `failure: S.Never`. The service surface is the `SaiService`
`Context.Tag` interface, and the exported `router` is
`RpcRouter.make(...)` mapping each tagged request to a method that pulls
`SaiService` from the Effect context. Output IRIs are unbranded `S.String` on
the wire; `IRI` is a `S.brand('IRI')` used for internal typing only.

## The entrypoint (`ApiHandler`)

`ApiHandler` is a CSS `OperationHttpHandler` bound to `POST /.sai/api`. It
reads the `css-account` cookie, resolves the account via `cookieStore`, finds
the linked webId via `webIdStore`, and obtains the user's `AuthorizationAgent`
session from `sessionManager`. It then parses the RPC envelope, rewrites the
envelope `traceId/spanId` from the active OpenTelemetry span, builds a
`SaiServiceLive = Layer.succeed(SaiService, ...)` where each method resolves
the request context and delegates to a service function, and finally runs
`RpcRouter.toHandlerNoStream(router)` inside `Effect.provide`.

## Context resolution (personal vs org)

`services/Context.ts` owns `ResolvedContext`. The invariant is that the session
is **always the signed-in user's own AuthorizationAgent** — no org session is
minted. If `context === userSession.webId`, it resolves to the user's own
registry set. Otherwise `isAdminOf` must pass (the org's reciprocal
registration of the user carries a non-empty `hasAdminGrant`), after which the
org's registry set is resolved through the org's agent-id document and writes
are owned by `ctx.webId` as the org. Failure throws `ContextError`.

## Services

Each file under `packages/components/src/services/` owns one domain:

- `Account` — handle uniqueness + account/webId/registry-set bootstrap.
- `ApplicationRegistry` — application listings and unregistered-app profiles.
- `SocialAgentRegistry` — social agent listing, profiles, `acceptInvitation`.
- `RoleRegistry` — role CRUD (`createRole`, `updateRole`, `deleteRole`).
- `InvitationRegistry` — invitation listing and `createInvitation`.
- `DataRegistry` — data registries and data-instance listing.
- `Authorization` — descriptions, `recordAuthorization`, `archiveAccessRequest`.
- `ShareResource` — `shareResource`, `requestAccessUsing*`, access matching.
- `Revocation` — `revokeGrants` (delegates to `GrantRevocationHandler`).
- `Admin` — `addAdmin`/`removeAdmin` with a last-admin guard.
- `peerProxy`/`peerFetch`/`ReciprocalMirror` — org-context peer reads and the
  server-side reciprocal mirror.
- `adminGate` — `requireOrgAdmin` guard shared by the admin-only endpoints.

Writes are **activity-first**: the service validates and appends one activity
to the Activity Registry, then returns a pending ack; a Temporal workflow
materializes the resource and completes it (see
[Activity outbox and events pipeline](../services/activity-lifecycle.md)).
