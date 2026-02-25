# Infetrix

**BYOK inference routing for people who care about cost, speed, and control.**

Infetrix is a personal open-source project by a developer in Vienna.
The idea is simple: you bring your own provider keys, Infetrix chooses the best provider for each request based on live routing signals, and you keep full control over infrastructure spend.

## Goal

Infetrix aims to be the practical middleware between your app and GPU inference providers:

- compare providers by `price`, `latency`, and `availability`
- route each request using a clear policy (`cost`, `latency`, `balanced`)
- keep keys user-owned (BYOK), not platform-owned
- add a Mojo/MAX optimization stage to cut GPU time per request

Target outcome: **materially lower inference cost without losing responsiveness**.

## What Exists Today

### Backend (Go)

- `GET /health`
- `POST /v1/route` (route decision only)
- `POST /v1/infer` (route + provider dispatch)
- policy engine with weighted scoring
- provider adapters implemented: `runpod`, `huggingface`
- API key redaction in responses/logs via preview format

### Frontend (Next.js + TypeScript)

- single-page UI flow (input -> providers -> result)
- route-only and infer modes
- production deployment on Vercel
- proxy API routes (`/api/route`, `/api/infer`) plus internal `/v1/*` handlers

### Planned Providers

- RunPod
- Vast.ai
- Hugging Face Inference API
- Modal
- Lambda Labs

## Repository Layout

```text
Infetrix/
├── cmd/infetrix/            # Go entrypoint
├── internal/
│   ├── api/                 # HTTP handlers and request validation
│   ├── config/              # Env-driven config
│   ├── provider/            # Provider adapters
│   ├── router/              # Ranking and policy engine
│   └── security/            # Redaction helpers
├── frontend/                # Next.js + TypeScript app
├── docs/                    # Architecture and optimization notes
└── scripts/max/             # Mojo/MAX benchmark scripts
```

## Quick Start

### 1. Run backend

Requirements: Go 1.22+

```bash
go run ./cmd/infetrix
```

Optional env vars:

```bash
export INFETRIX_ADDR=":8080"
export INFETRIX_DEFAULT_POLICY="balanced"
```

### 2. Run frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## API Example

### Route-only

```bash
curl -s http://localhost:8080/v1/route \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Summarize this text.",
    "model": "llama-3.1-8b-instruct",
    "policy": "balanced",
    "providers": [
      {
        "name": "runpod",
        "endpoint": "https://api.runpod.ai/v2/YOUR_ENDPOINT/runsync",
        "api_key": "rp_demo_key_123",
        "price_per_1k_tokens": 0.024,
        "avg_latency_ms": 420,
        "availability": 0.99
      },
      {
        "name": "huggingface",
        "endpoint": "https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-8B-Instruct",
        "api_key": "hf_demo_key_456",
        "price_per_1k_tokens": 0.030,
        "avg_latency_ms": 380,
        "availability": 0.98
      }
    ]
  }' | jq
```

### Route + dispatch

```bash
curl -s http://localhost:8080/v1/infer \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Say hello in one short line.",
    "model": "llama-3.1-8b-instruct",
    "policy": "balanced",
    "max_tokens": 64,
    "temperature": 0.3,
    "providers": [
      {
        "name": "runpod",
        "endpoint": "https://api.runpod.ai/v2/YOUR_ENDPOINT/runsync",
        "api_key": "rp_demo_key_123",
        "price_per_1k_tokens": 0.024,
        "avg_latency_ms": 420,
        "availability": 0.99
      }
    ]
  }' | jq
```

## Security Notes

- No provider secret is hardcoded in application source.
- `.env.local` and other local env files are ignored via `.gitignore`.
- API keys are never returned in full; only redacted previews are exposed.
- This is still an early-stage project. Before production hardening, add auth, rate limits, and stricter endpoint validation.

## Mojo/MAX Optimization Track

Playbook: `docs/optimization/mojo-max-playbook.md`

Run baseline:

```bash
./scripts/max/run_baseline.sh <model_path> artifacts/baseline.json
```

Run tuned:

```bash
./scripts/max/run_tuned.sh <tuned_model_path> artifacts/tuned.json
```

Compare:

```bash
./scripts/max/compare.py artifacts/baseline.json artifacts/tuned.json
```

## Project Direction

1. Add adapters for Vast.ai, Modal, and Lambda Labs.
2. Add request auth + rate limits for public deployment.
3. Add endpoint validation and abuse controls for BYOK dispatch.
4. Integrate Mojo optimization before provider dispatch and publish cost/latency benchmarks.

---

If you want to contribute, open an issue with a concrete use case or benchmark scenario.
