# Infetrix v1 Architecture

## Scope (MVP)

Infetrix v1 is a BYOK inference routing service for text-model requests.
It does not host models. It ranks providers and can dispatch requests to the selected provider.

## Goals

- Minimize user inference cost and latency using policy-based routing.
- Keep keys user-owned (BYOK), never persisted by default.
- Provide transparent decision output so routing is explainable.

## Non-Goals (v1)

- No model execution inside Infetrix.
- No automatic key storage in a database.
- No Mojo optimization pipeline execution yet (design hook only).

## High-Level Components

1. API Layer (`internal/api`)
- `POST /v1/route`: accepts model + provider metrics + optional policy.
- `POST /v1/infer`: routes and forwards inference request to selected provider adapter.
- `GET /health`: service health endpoint.

2. Routing Engine (`internal/router`)
- Normalizes per-provider metrics.
- Applies policy weights (`cost`, `latency`, `balanced`).
- Returns ranked providers with score breakdown.

3. Config Layer (`internal/config`)
- Reads runtime config from environment variables.
- `INFETRIX_ADDR`
- `INFETRIX_DEFAULT_POLICY`

4. Security Utilities (`internal/security`)
- Redacts API keys for logging and response previews.

5. Provider Adapters (`internal/provider`)
- `runpod` adapter: forwards request in RunPod-style schema.
- `huggingface` adapter: forwards request in Hugging Face inference schema.

## Request Flow

1. Client sends prompt metadata + provider candidates (including BYOK info).
2. API validates payload.
3. Router computes scores:
- Cost score (lower token cost => higher score)
- Latency score (lower latency => higher score)
- Availability score (higher uptime => higher score)
4. Policy weights are applied:
- `cost`: 70% cost, 20% latency, 10% availability
- `latency`: 20% cost, 70% latency, 10% availability
- `balanced`: 45% cost, 35% latency, 20% availability
5. API returns ranked providers and the selected provider.
6. For `/v1/infer`, request is forwarded to selected provider and provider response is returned.

## Security Notes

- Do not log raw API keys.
- `api_key` appears in request for BYOK UX but is redacted in logs.
- Keep transport behind HTTPS/TLS terminator in deployment.
- Add request auth and per-user rate limiting before public exposure.

## Mojo Integration (v1.1+ Hook)

Introduce an optimizer stage before final provider dispatch:

- Input: model, prompt shape, constraints (cost/latency SLA).
- Output: optimized execution plan (quantization, batch profile, kernel hints).
- Router can then score providers using optimized projected metrics instead of raw metrics.

This keeps the core router stable while enabling Mojo as an optional performance module.
