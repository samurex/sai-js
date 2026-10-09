---
type: reference
title: Sequence and discovery flows
description: A catalogue of the dynamic views in docs/temporal.c4 — discovery, reciprocal registration, invitation, admin, roles, share/request access, and authorization flows — as the authoritative interaction sequences.
tags: [likec4, sequences, flows, temporal, discovery]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T19:35:35.072Z
sources:
  - id: openwiki-source-7705adcc9d658c079a979e1b
    resource: repo://docs/likec4.md
  - id: openwiki-source-f94e6df9b22c5d9088de9576
    resource: repo://docs/temporal.c4
generated: { by: "pi", at: "2026-10-09T19:35:35.072Z" }
---

# Sequence and discovery flows

`docs/temporal.c4` is the authoritative catalogue of interaction sequences,
modelled as LikeC4 **dynamic views**. Its `model` block defines the parties as
`security` actors — `ACME`, `Others`, `Common`, `Alice`, `Bob`, `Kim`, `Dan`,
`YoYo`, `Peers`, and `App` — where each user/org actor owns a **UAS** (User
Authorization Server) containing `UiApi`, `Temporal`, `WebhookReceiver`, and
`Discovery`, plus a `Registry`, an optional `Data` registry, a `WebhookSender`,
and an `AUI` authorization UI. `App` owns the application-side
`StreamingHTTPReceiver`, `UI`, and `CID`. `Common` hosts the shared
`Shapetrees` directory.

The `docs/likec4.md` convention file governs how these views are authored
(dynamic-view syntax, note callouts, include ordering, request+response as a
single step).

## Discovery flows

- `application-registration-discovery` — an application performs a `HEAD` on
  the authorization-agent id with credentials; `Discovery` looks up the
  Application Registration and returns it via a Link header.
- `social-agent-registration-discovery` — one UAS's `Discovery` asks a peer
  UAS's `Discovery`; the peer finds the Social Agent Registration and returns
  it via a Link header.
- `org-registry-set-discovery` — an org admin's `Discovery` resolves the org's
  Registry Set; the `hasRegistrySet` link is returned only when the caller's
  registration carries the `hasAdminGrant` admin marker.

## Reciprocal registration

- `reciprocal-registration-update` — a peer's `DelegatedGrantsUpdated` webhook
  `Update` triggers `updateDelegatedGrants`: find affected authorizations,
  fan out grant updates and delegation registration, then write
  `ActivityCompleted`.

## Invitation

- `invitation` — personal invitation create/accept.
- `admin-invitation-send` / `admin-invitation-receive` — org-context
  invitations where a person invites an org (accepted by the org admin) and an
  org admin invites a person.

## Admin

- `org-admin-add` / `org-admin-remove` — an org admin grants/revokes admin
  status on a member, driving `createAdminGrants`/`revokeAdminGrants` plus ACR
  sync.
- `org-admin-add-personal` / `org-admin-remove-personal` — a user makes an
  agent an admin of their own (personal) context.

## Roles

- `role-membership-change` — `processRoleMembershipChange` fans out grant
  updates to every member of a changed role.
- `role-deletion` — `processRoleDeletion` revokes grants tied to a deleted
  role.

## Authorization and access

- `authorization` and `authorization-data-app` — recording an authorization
  decision and the resulting authorization data.
- `authz-data-need-based-request` — the authorization data behind a
  need-based access request.
- `share-resource` — the owner shares a data instance, generating grants.
- `request-access` — a requester sends a need-based access request.
- `approve-access-request` / `deny-access-request` — the owner approves or
  (silently) declines a need-based access request.

The activity→workflow→view mapping is catalogued in `docs/features.md`; the
corresponding Temporal workflow definitions are documented in
[Temporal workflows and activities](../temporal/workflows.md).
