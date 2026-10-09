# Plan: Generic auditing for creation metadata

> **Status:** ⬜ not started (design only) — deferred from `depend-on-generic-auditing.md` (that plan is now superseded; the removal it performed is documented in the OpenWiki).

## Goal

Introduce a **generic auditing mechanism** that provides creation metadata — the acting agent/client and creation/modification timestamps — for SAI resources, replacing the hand-written interop properties that sai-js used to write on every container create.

## Background

sai-js previously wrote `interop:registeredBy`, `interop:registeredWith`, `interop:registeredAt`, and `interop:updatedAt` (via the removed `setTimestampsAndAgents`) on every container create. That write was removed because **nothing in the repository reads these properties** — they were dead data, and `updatedAt` was stale the moment anything changed (it was only ever written at creation).

The intended replacement is server-side / Solid-server-provided audit metadata rather than application-written properties.

## Open items

- Design the mechanism (server-side audit log vs Solid server metadata).
- Open question: whether ACR documents should also stop writing agent/client data (`interop:registeredBy` / `interop:registeredWith` in the ACR templates).
- Re-introduce consumers once metadata is provided generically.

## References

- Supersedes the now-removed `depend-on-generic-auditing.md`.
