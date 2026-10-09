---
type: architecture
title: Activity outbox and events pipeline
description: The append-only Activity Registry outbox, Solid Notifications webhook delivery, ActivityWebhookHandler routing (owner vs admin channels), the ActivityEvents bus, the embedded DataAuthorizationData POJO carrier at pre-minted ids, and the reconcileActivities backstop.
tags: [activities, webhook, events, solid-notifications, architecture]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T20:45:09.690Z
sources:
  - id: openwiki-source-a9275a0e3a23f49eea3d9b3f
    resource: repo://packages/components/src/ActivityEvents.ts
  - id: openwiki-source-c18acf0c50387f2e5ea026d1
    resource: repo://packages/components/src/ActivityWebhookHandler.ts
  - id: openwiki-source-a9727c97c08565f7dac9c147
    resource: repo://packages/components/src/EventsHandler.ts
  - id: openwiki-source-9f9c5f051cdee5032dfd735b
    resource: repo://packages/components/src/services/Authorization.ts
  - id: openwiki-source-ec9b01d4f49d308517fdc575
    resource: repo://packages/components/src/services/ShareResource.ts
  - id: openwiki-source-03c71d0f7eed5c1f113d08e3
    resource: repo://packages/components/src/temporal/workflows/grants.ts
  - id: openwiki-source-40eb9f7315a1082fe32671da
    resource: repo://packages/data-model/src/activities.ts
generated: { by: "pi", at: "2026-10-09T20:45:09.690Z" }
---

# Activity outbox and events pipeline

The SAI service layer is **activity-first**: RPC handlers validate input and
append one typed `Activity` to a per-webId **Activity Registry** outbox, then
return a pending acknowledgement. Solid Notifications delivers the container
`Add` to a webhook; `ActivityWebhookHandler` decodes it and either starts a
Temporal workflow (owner channel) or only forwards it (observer/admin channel).
Workflows finish by writing a minimal `ActivityCompleted` resource, which is
forwarded as `done`.

## The activity union

`ActivityData` is the typed discriminant union of one member per activity RDF
class (`InvitationAccepted`, `AuthorizationGranted`, `DelegatedGrantsUpdated`,
`ActivityCompleted`, …), and `isActivityClass(activity, cls)` checks membership
in the class tuple. The comment on the union codifies the extension seam:
adding a class means extending the union plus the vocab/context entry, and
updating the handler, `reconcileActivities`, and the UI `events.ts` row.

## Activity object carrier

Granting activities embed the term-covered `DataAuthorizationData` POJOs
directly on the activity `object` at **pre-minted ids** — there is no separate
RPC structure crossing the wire (the carrier decision that settled the RPC
term gap). `recordAuthorization` pre-mints the data authorizations and embeds
them as `AuthorizationGranted.object: DataAuthorizationData[]`, and
`shareResource` does the same with the `buildShareDataAuthorizations` output.

## Webhook entrypoint and routing

`ActivityWebhookHandler.handle` resolves the delivery channel by `sendTo`
(404 if unknown), parses the body (400 on malformed JSON), and acts only on
`Add` notifications that carry an `object`. It loads the activity with the
channel's session, then **forwards to the events bus before dispatch** so every
`Add` emits a line. Owner versus observer is decided by
`session.registrySet.hasActivityRegistry?.id === channel.topic`: a non-owner
(admin) channel returns 200 forwarding-only; the owner channel proceeds to
`dispatch`, which is one branch per activity class and starts the matching
workflow on its task queue (`AuthorizationDenied` is a no-op forward-only).

## Events bus and stream

`ActivityEvents` is an in-memory `WrappedSetMultiMap<webId, PassThrough>`.
`forwardActivity` emits `{type: 'activity', activity, status}` where a regular
activity is `pending` and an `ActivityCompleted` is enriched back into `done`
by loading its `target` original. `EventsHandler` serves `GET /.sai/events`,
resolves the webId from the account cookie, subscribes a stream, flushes
headers with an initial heartbeat, and heartbeats every ~30s. There is no
replay — clients must listen first.

## Reconciliation backstop

`reconcileActivities` (a Temporal workflow) reprocesses every activity that has
no completion referencing it, using the same owner-channel routing. It skips
`AgentRegistrationAdded` and reuses deterministic grantee workflow ids so a
running consumer absorbs entries. It currently has no scheduler/caller and is
run on demand (e.g. directly by tests); a permanently failing workflow leaves
its activity `pending` indefinitely, with reconciliation as the unscheduled
backstop.
