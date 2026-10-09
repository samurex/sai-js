---
type: operations
title: Production deployment and observability
description: The NixOS/Podman VPS deployment (nixos-anywhere, flake hosts, ragenix-encrypted secrets, Caddy reverse proxy) and the OpenTelemetry/Tempo/Grafana observability path for sai-js.
tags: [operations, nixos, podman, caddy, ragenix, opentelemetry, tempo]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T19:35:35.072Z
sources:
  - id: openwiki-source-ec41bb5ef5df8f458a78c5ac
    resource: repo://docs/opentelemetry.md
  - id: openwiki-source-3eda5d2b85501c78fc0ba02d
    resource: repo://flake.nix
  - id: openwiki-source-aec65e72753159f364299ec7
    resource: repo://nix/caddy.nix
  - id: openwiki-source-b5b7c7b18f157aa016a62301
    resource: repo://nix/h4p.nix
  - id: openwiki-source-833782312af20d943c4bd83d
    resource: repo://nix/podman.nix
  - id: openwiki-source-60ea044d0e14ab98032a8e8c
    resource: repo://packages/components/src/tracing/bootstrap.ts
  - id: openwiki-source-c862349b5581cece054d0a3b
    resource: repo://tempo/tempo.yaml
generated: { by: "pi", at: "2026-10-09T19:35:35.072Z" }
---

# Production deployment and observability

Production runs as NixOS hosts whose containers are managed by Podman, with
Caddy as the edge reverse proxy, ragenix-encrypted secrets, and an
OpenTelemetry → Tempo → Grafana trace pipeline.

## Flake hosts

`flake.nix` declares a ragenix input and several `nixosConfigurations`:

- `hetzner-cloud-aarch64` — the bare Hetzner target installed with
  `nixos-anywhere`.
- `h4p` — the production host; pulls in the ragenix module, `nix/caddy.nix`,
  and `nix/podman.nix`.
- `demo` — the Cloudflare-based demo host (also ragenix + caddy + podman).
- `lima`, `lima-min`, `lima-local` — local Lima VM variants.

## Podman container runtime

`nix/podman.nix` sets `virtualisation.oci-containers` with
`backend = "podman"` and declares the full service fleet (oxigraph, sparql, id,
postgresql, temporal, auth, worker, registry, data). Containers get systemd
`Restart = "always"` by default; the one-shot Temporal schema/namespace setup
jobs force `Restart = "no"`.

## Caddy and secrets

`nix/caddy.nix` defines the container options and Caddy `virtualHosts` for
`*.id`, `data`, `registry`, `auth`, and `ui`. `nix/h4p.nix` wires the Caddy
Gandi DNS plugin for ACME DNS-01 challenges, mounts `age.secrets.gandi` and
`age.secrets.auth` via ragenix, exposes the bearer token through a systemd
`EnvironmentFile`, and opens the firewall. Deployment is manual:
`nixos-anywhere --flake .#hetzner-cloud-aarch64` then
`nixos-rebuild switch --flake .#me --target-host … --build-host …`.

## Observability

Every instrumented Node process starts OpenTelemetry through
`packages/components/src/tracing/preload.cjs` and `bootstrap.ts`
(`initNodeTracing`), exporting OTLP/HTTP to the Tempo service. Env precedence
is deliberate: `SAI_OTLP_ENDPOINT` (explicit, used under Dagger whose engine
injects its own `OTEL_EXPORTER_OTLP_ENDPOINT`) wins over the plain
`OTEL_EXPORTER_OTLP_ENDPOINT` used by the Compose dev loop; `OTEL_SERVICE_NAME`
sets `service.name`.

`tempo/tempo.yaml` runs single-binary Tempo: OTLP ingestion on `4317` (gRPC)
and `4318` (HTTP), the TraceQL/query API on `3200`, with local WAL/blocks. A
provisioned Grafana datasource (`grafana/provisioning/datasources/tempo.yaml`)
points Grafana at Tempo, so traces are browsable out of the box. The detailed
precedence and troubleshooting lives in `docs/opentelemetry.md`.
