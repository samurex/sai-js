---
type: operations
title: Production deployment and observability
description: The NixOS/Podman VPS deployment (nixos-anywhere, flake hosts, ragenix-encrypted secrets, Caddy reverse proxy) and the OpenTelemetry env contract, mechanics, and Tempo/Grafana observability path for sai-js.
tags: [operations, nixos, podman, caddy, ragenix, opentelemetry, tempo]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T21:04:39.559Z
sources:
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
generated: { by: "pi", at: "2026-10-09T21:04:39.559Z" }
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
(`initNodeTracing`), exporting OTLP/HTTP to the Tempo service. Production is
off by construction — with no env vars the SDK is a no-op.

### Env contract

| Var | Effect |
| --- | --- |
| `SAI_OTLP_ENDPOINT` | our OTLP endpoint, handed to the exporter explicitly — required under Dagger, whose engine injects and overrides `OTEL_EXPORTER_OTLP_ENDPOINT` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | live OTLP/HTTP export for the Compose dev loop when `SAI_OTLP_ENDPOINT` is unset |
| `OTEL_SERVICE_NAME` | span `service.name` (sai-test / sai-uas / sai-id / sai-registry / sai-data / sai-worker) |
| `OTEL_CAPTURE_HEADERS=true` | attach `authorization` / `cookie` / `content-type` / `accept` / `if-none-match` / `link` as span attributes |
| `OTEL_SDK_DISABLED=true` / `OTEL_TRACES_EXPORTER=none` | hard-off |

`SAI_OTLP_ENDPOINT` wins because the Dagger engine injects the standard vars for
its own telemetry; the dedicated endpoint is passed straight to the exporter so
the injected standard vars are ignored.

### Mechanics

`HttpInstrumentation` + `UndiciInstrumentation` provide server/client spans, and
`SimpleSpanProcessor` is used (synchronous — no batching, no tail-span loss when
services are killed). `ApiHandler` wraps each RPC call in a `sai.rpc.handle`
span; the JSON-LD helpers emit `sai.jsonld.raw` / `sai.jsonld.framed` /
`sai.jsonld.expanded` spans; SPARQL reads run inside `sparql.query` spans;
Temporal uses `OpenTelemetryPlugin` on the three workers and the client. Browser
spans export from the UI to `/otlp`, routed by Traefik to `tempo:4318`.

`tempo/tempo.yaml` runs single-binary Tempo: OTLP ingestion on `4317` (gRPC)
and `4318` (HTTP), the TraceQL/query API on `3200`, with local WAL/blocks. A
provisioned Grafana datasource (`grafana/provisioning/datasources/tempo.yaml`)
points Grafana at Tempo, so traces are browsable out of the box.
