---
type: index
title: Quickstart
description: Task-routing map of the sai-js wiki — architecture, data model, service layer, activity pipeline, Temporal workflows, UI, testing, and operations pages at a glance.
tags: [quickstart, index, navigation]
sources:
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: { by: "pi", at: "2026-10-09T20:45:09.690Z" }
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T20:45:09.690Z
---

# Quickstart

`sai-js` is a TypeScript monorepo implementing the
[Solid Application Interoperability specification](https://solid.github.io/data-interoperability-panel/specification/).
Use this map to find the page for the topic you need.

## Find your topic

| I want to… | Read |
| --- | --- |
| Understand the repo and packages | [Architecture overview](architecture/overview.md) |
| See the production landscape | [Deployment landscape](architecture/deployment-landscape.md) |
| Learn the JSON-LD entities | [Data model entities](data-model/entities.md) |
| Learn the JSON-LD read/write helpers | [JSON-LD read/write layer](data-model/json-ld-layer.md) |
| Understand the RPC contract and services | [RPC contract and service layer](services/rpc-and-services.md) |
| See the org-admin data plane | [Org-context data plane](services/org-context.md) |
| Trace the activity/outbox flow | [Activity outbox and events pipeline](services/activity-lifecycle.md) |
| See the async workflow machinery | [Temporal workflows and activities](temporal/workflows.md) |
| Find the interaction sequences | [Sequence and discovery flows](temporal/sequence-views.md) |
| Understand the browser console | [Authorization UI](ui/authorization-ui.md) |
| Set up local development | [Local development environment](operations/development.md) |
| Deploy and observe | [Production deployment and observability](operations/deployment.md) |
| Run the test suite | [Integration test suite](testing/integration-tests.md) |
| Inspect the supporting services | [Auxiliary services](integrations/auxiliary-services.md) |

## Core flow in one line

A UI action posts an `@effect/rpc` request to `ApiHandler`; a service validates
it and appends one **Activity** to the Activity Registry outbox; a Solid
Notifications webhook `Add` reaches `ActivityWebhookHandler`, which forwards it
to the events stream and (on the owner channel) starts a **Temporal workflow**
whose activities materialize grants/registrations and write an
**ActivityCompleted** — which the events stream delivers back to the UI.
