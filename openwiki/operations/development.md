---
type: operations
title: Local development environment
description: The Docker Compose dev stack (auth, registry, data, worker, ui, router, dns, temporal, sparql, garage, tempo, grafana), wildcard *.docker DNS via dnsmasq, mkcert TLS, and the devbox seed workflow.
tags: [operations, docker, development, dns, mkcert, devbox]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T19:35:35.072Z
sources:
  - id: openwiki-source-4835a4ac60ade4980988746a
    resource: repo://.env
  - id: openwiki-source-09746815d483fcef938cf59c
    resource: repo://devbox.json
  - id: openwiki-source-b8a927b0cc8a1ee64f5a4f78
    resource: repo://docker-compose.yaml
  - id: openwiki-source-012f2c78e3b1446dfc35803f
    resource: repo://Makefile
  - id: openwiki-source-ccdcdbc048f49246514e9069
    resource: repo://mkcert.sh
generated: { by: "pi", at: "2026-10-09T19:35:35.072Z" }
---

# Local development environment

The local loop is a Docker Compose stack whose service definitions and shared
environment anchors live in `docker-compose.yaml`. `make up` starts it, and a
devbox `seed` script loads the seed data.

## Services

The Compose stack runs the full cluster:

- **Solid/OIDC and SAI**: `auth`, `registry`, `data` (three Community Solid
  Server instances), plus `worker` (the Temporal worker) and `ui` (the
  authorization console).
- **Routing and DNS**: `router` (Traefik) and `dns` (dnsmasq).
- **Infrastructure**: `postgresql`, `temporal` (plus the one-shot admin-tools
  and create-namespace jobs), `oxigraph` + `sparql` (nginx in front of
  oxigraph), `id`, and `garage` (S3).
- **Observability**: `tempo` and `grafana`.

A `networks.sai` network with subnet `172.16.0.0/16` connects the services, and
Traefik's Docker provider routes by hostname from static certs under
`traefik/certs`.

## Wildcard DNS and TLS

dnsmasq maps every `*.docker` name to the Traefik container IP
`172.16.0.250` (`.env` `DMQ_GLOBAL=address=/docker/172.16.0.250`), and app
containers point their resolver at `172.16.0.253`. `mkcert.sh` reads
`TLS_DOMAINS` and generates a wildcard certificate into
`traefik/certs/cert.pem` via `make cert-install`, so `https://auth.docker`,
`https://*.data.docker`, `https://ui.auth.docker`, and friends work locally.
macOS users add bridge routes with `docker-mac-routes-add.sh`.

## Build, run, seed

- `make up` = `docker compose up --remove-orphans -d --wait`; `make up-router`
  and `make up-dns` start just those subsets.
- Node requires version 22+ (npm/corenpm via the root `packageManager`).
- Seeding is a devbox script, not a Make target:
  `bun packages/repl/cmd.ts -- seed-env` (`devbox run seed`), which writes the
  `environments/data` seed (registry TriG, KV store, client-id) into the
  running services.

The dev URL→IRI mapping is in `environments/dev/map.json`; the production
equivalent is the NixOS/Podman deployment documented in
[Production deployment](../operations/deployment.md).
