---
type: data-model
title: Data model entities
description: The data-model package's JSON-LD POJO entities — registries, registrations, grants, roles, access needs, shape trees, activities, and the ACR templates — and how each maps to the Solid Application Interoperability specification.
tags: [data-model, json-ld, solid, entities, typescript]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T19:35:35.072Z
sources:
  - id: openwiki-source-40eb9f7315a1082fe32671da
    resource: repo://packages/data-model/src/activities.ts
  - id: openwiki-source-5f3a5827ade0bebc11f29499
    resource: repo://packages/data-model/src/context.ts
  - id: openwiki-source-6b6976370d0cdcf6bd57cad3
    resource: repo://packages/data-model/src/grant.ts
  - id: openwiki-source-81127af59080ceff3a2cde89
    resource: repo://packages/data-model/src/index.ts
  - id: openwiki-source-baaabdb26a02bad8b3a7b3f4
    resource: repo://packages/data-model/src/registry-set.ts
  - id: openwiki-source-12dd5601be4d1b21ac977892
    resource: repo://packages/data-model/src/templates/index.ts
generated: { by: "pi", at: "2026-10-09T19:35:35.072Z" }
---

# Data model entities

`@janeirodigital/interop-data-model` (`packages/data-model`) is the pure,
dependency-light JSON-LD POJO layer shared by the `application` and
`authorization-agent` packages. It owns entity data types, `fromJsonLd` readers,
a single shared `dataModelContext`, and the ACP/ACR Turtle templates. It imports
neither of the other SAI packages.

The public surface is `packages/data-model/src/index.ts`, which re-exports
entities both as `type` (the data shape) and as namespaces (helpers such as
`fromJsonLd` / `toDataset`), to avoid name collisions between e.g. a `RoleData`
type and its helpers.

## Entity groups

- **Registries and registrations** — `RegistrySetData` lists every registry a
  context owns (authorization, grant, social-agent, application, invitation,
  role, data, plus optional activity and access-request registries); the agent
  registries and registrations are the `SocialAgentRegistryData` /
  `ApplicationRegistryData` / `InvitationRegistryData` and
  `SocialAgentRegistrationData` / `ApplicationRegistrationData` /
  `SocialAgentInvitationData` shapes.
- **Authorization and grants** — `DataAuthorizationData`, `AdminAuthorizationData`,
  `GrantData` (with scope fields `inheritsFromGrant`, `delegationOfGrant`,
  `hasInheritingGrant`), and the authorization/grant registry shapes.
- **Data** — `DataRegistryData`, `DataRegistrationData`, `DataInstanceData`
  (with `isBlob` and `frameDataInstance` helpers).
- **Access needs** — `AccessNeedData` (recursive `children`, a `required`
  derived from `interop:accessNecessity`), `AccessNeedGroupData`, and the
  `*Description` shapes (`AccessDescriptionData`, `AccessNeedDescriptionData`,
  `AccessNeedGroupDescriptionData`).
- **Roles** — `RoleData` with a language-mapped `label` and `members`.
- **Shape trees** — `ShapeTreeData` (with `references` via `viaPredicate`) and
  `ShapeTreeDescriptionData`.
- **Activities** — `ActivityData`, a discriminated union of one member per RDF
  activity class, with `isActivityClass(activity, cls)` membership checks.
- **Messages and identity** — `AccessRequestMessage` / `NeedBasedAccessRequest*`
  / `AccessRevocationMessage`, `WebIdProfileData`, `ClientIdDocumentData`, and
  `DataOwnerData`.

## JSON-LD framing

`fromJsonLd` readers uniformly take a JSON-LD document (expanded, compacted, or
flattened), frame it through the shared `dataModelContext` (a JSON-LD 1.1
context that aliases `id` to `@id` and forces `type` into a set container), and
project it into a typed POJO. This is the payload contract anchor between the
wire format and the typed layers above it.

## Templates

`packages/data-model/src/templates/` exports ACP/ACR Turtle generators used when
the agent bootstraps or grants access:

- `RegistrySet.ts` — the full registry set plus its root ACR.
- `AgentRegistration.acr.ts` — owner + peer read ACR for an agent registration.
- `DataGrant.acr.ts` — grantor/peer/client ACLs for a data grant.
- `WebId.ts` and `DataRegistry.ts` — WebID document and data registry bootstrap.
- `types.ts` — the shared `AgentAndClient` types.

The templates are the mechanism by which the service layer materializes
delegated read access as concrete ACP resources (see
[RPC contract and service layer](../services/rpc-and-services.md)).
