# Files

- [Activity outbox and events pipeline](activity-lifecycle.md) - The append-only Activity Registry outbox, Solid Notifications webhook delivery, ActivityWebhookHandler routing (owner vs admin channels), the ActivityEvents bus, the embedded DataAuthorizationData POJO carrier at pre-minted ids, and the reconcileActivities backstop.
- [Org-context data plane](org-context.md) - The org-admin data plane — the SPARQL read plane (queries/org.ts, sparqlTransportFor), the /sparql-admin HTTP-QUERY endpoint, the /.sai/proxy-admin GET-only JSON-LD-only proxy, the admin-side peer clients, and the ACP non-cascade constraint with its seeded-resource mutation debt.
- [RPC contract and service layer](rpc-and-services.md) - The @effect/rpc + effect Schema contract in api-messages, the ApiHandler entrypoint, personal-versus-org context resolution, and what each component service owns.
