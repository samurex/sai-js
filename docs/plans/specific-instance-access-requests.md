# Plan: Specific-instance access requests

> **Status:** ⬜ not started (design only) — deferred from `authorization-granting.md` Step 5 (that plan is now superseded; its landed design is documented in the OpenWiki). No request-side caller exists yet.

## Goal

Support access requests that target **specific data instances**, not just shape-tree or access-need scopes. The request-side RPC surface and the granting path must let a requester ask for, and an owner grant, access to a specific `DataInstance` (`hasDataInstance` on `AccessNeed`), in addition to the current shape-tree/access-need-group scopes.

## What already exists

- `AccessNeedData` carries `hasDataInstance` (`packages/data-model/src/access-need.ts`).
- The granting pipeline (`recordAuthorization` → `AuthorizationGranted` → `processAuthorizationGranted` → per-grantee `processGranteeAuthorization`) is structure-based and handles the current scopes; it has no specific-instance branch yet.

## Open items

- A request-side caller (UI flow / RPC) that selects one or more data instances.
- Granting-path support: generating `DataAuthorization`s scoped to specific instances and the corresponding grants.
- Correlation: how a granted specific-instance authorization is surfaced to the requester (the derived `DataGrant` does not carry `satisfiesAccessNeed` — see the OpenWiki activity pipeline notes).

## References

- Supersedes the deferred Step 5 (§6/§11.2) of the now-removed `authorization-granting.md`.
