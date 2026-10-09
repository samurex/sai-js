# Files

- [Deployment landscape](deployment-landscape.md) - The h4p.net production landscape modeled in docs/architecture.c4 — reverse proxy, auth (SAI agent, Solid-OIDC provider, FedCM), registry set, data, webid, account UI, workers, and their quadstore/postgres/S3 storage backends.
- [Architecture overview](overview.md) - The sai-js monorepo, the Solid Application Interoperability specification it implements, its npm-workspace package layout, and the build/test tooling that ties the packages together.
- [Social graph](social-graph.md) - The inter-peer connection topology — the three connection tiers (push webhook, one-shot request/response, authenticated pod access), the reciprocal-webhook polarity asymmetry, the delegation chain, and the org-vs-admin edges.
