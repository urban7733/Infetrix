<p align="center">
  <img src="docs/assets/infetrix-black-tech.svg" alt="Infetrix" width="100%" />
</p>

<h1 align="center">Infetrix</h1>

<p align="center">
  <strong>Intelligent LLM Inference Router with Cost-Aware Provider Selection</strong>
</p>

<p align="center">
  <a href="https://inferix-phi.vercel.app">
    <img alt="Live Demo" src="https://img.shields.io/badge/demo-live-22c55e?style=flat-square" />
  </a>
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs" />
  <img alt="Go" src="https://img.shields.io/badge/Go-1.22-00ADD8?style=flat-square&logo=go&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" />
</p>

<p align="center">
  Route AI inference requests to the optimal provider based on cost, latency, and availability constraints.
  <br />
  Built with production-grade architecture for real-world AI workloads.
</p>

---

## Overview

Infetrix is a **workload-first inference routing system** that intelligently selects the best LLM provider for each request. Instead of hardcoding a single provider, define workload profiles with your constraints and let the routing engine optimize every call.

**Key insight**: Most teams overpay for inference by 30-50% because they use static routing. Infetrix implements dynamic provider selection using a weighted scoring algorithm that considers:

- **Cost efficiency** (price per 1k tokens)
- **Latency requirements** (p50/p99 response times)
- **Provider availability** (uptime guarantees)
- **Policy objectives** (cost-optimized, latency-optimized, or balanced)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client Request                              │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Infetrix Router                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Workload  │  │   Policy    │  │   Scoring   │  │   Provider  │    │
│  │   Manager   │──│   Engine    │──│   System    │──│   Dispatch  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
       ┌───────────┐          ┌───────────┐          ┌───────────┐
       │  RunPod   │          │ Hugging   │          │   More    │
       │           │          │   Face    │          │ Providers │
       └───────────┘          └───────────┘          └───────────┘
```

### Scoring Algorithm

The provider ranking uses a weighted composite score:

```python
score = (w_cost × normalize(1/price)) +
        (w_latency × normalize(1/latency)) +
        (w_availability × availability)

# Weight distribution by policy:
# balanced: w_cost=0.4, w_latency=0.4, w_availability=0.2
# cost:     w_cost=0.7, w_latency=0.2, w_availability=0.1
# latency:  w_cost=0.2, w_latency=0.7, w_availability=0.1
```

## Features

### Implemented

- **Workload Profiles**: Define once, execute by ID. Persist routing config, constraints, and provider credentials
- **Multi-Provider Support**: RunPod, Hugging Face Inference API (extensible adapter pattern)
- **Policy-Based Routing**: `balanced`, `cost`, `latency` optimization objectives
- **Constraint Enforcement**: Budget caps, latency SLAs, token limits
- **BYOK (Bring Your Own Keys)**: Provider credentials never leave your control
- **Real-time Scoring**: Transparent ranking with per-request decision traces
- **PostgreSQL Persistence**: Optional durable workload storage with pgvector support

### Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend | Go 1.22, Chi router, structured logging |
| Database | PostgreSQL (optional), in-memory fallback |
| Deployment | Vercel (frontend), any container platform (backend) |

## Quick Start

### Prerequisites

- Node.js 20+
- Go 1.22+ (for backend)
- PostgreSQL (optional)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Backend

```bash
go run ./cmd/infetrix
```

### Environment Variables

```bash
# Frontend (.env.local)
DATABASE_URL=postgresql://...  # Optional: enables persistent storage

# Backend
INFETRIX_ADDR=:8080
INFETRIX_DEFAULT_POLICY=balanced
```

## API Reference

### Create Workload

```bash
POST /v1/workloads
Content-Type: application/json

{
  "action": "create",
  "name": "production-router",
  "model": "llama-3.1-8b-instruct",
  "mode": "infer",
  "policy": "balanced",
  "max_tokens": 256,
  "temperature": 0.7,
  "budget_per_1k": 0.03,
  "latency_sla_ms": 800,
  "providers": [
    {
      "name": "runpod",
      "endpoint": "https://api.runpod.ai/v2/{id}/runsync",
      "api_key": "rp_xxx",
      "price_per_1k_tokens": 0.024,
      "avg_latency_ms": 420,
      "availability": 0.99
    }
  ]
}
```

### Execute Workload

```bash
POST /v1/workloads
Content-Type: application/json

{
  "action": "execute",
  "workload_id": "wkld_abc123",
  "input": "Summarize the key points..."
}
```

### Response

```json
{
  "request_id": "req_xyz789",
  "workload_id": "wkld_abc123",
  "selected_provider": {
    "name": "runpod",
    "total_score": 0.847
  },
  "rankings": [
    { "name": "runpod", "total_score": 0.847, "cost_score": 0.92, "latency_score": 0.78 },
    { "name": "huggingface", "total_score": 0.812, "cost_score": 0.85, "latency_score": 0.81 }
  ],
  "provider_response": { ... }
}
```

## Project Structure

```
infetrix/
├── cmd/infetrix/           # Go application entrypoint
├── internal/
│   ├── api/                # HTTP handlers, request validation
│   ├── config/             # Environment-driven configuration
│   ├── provider/           # Provider adapters (RunPod, HuggingFace)
│   ├── router/             # Scoring engine, policy implementation
│   └── security/           # Key redaction, input sanitization
├── frontend/
│   ├── app/                # Next.js App Router
│   │   ├── v1/workloads/   # Workload management API routes
│   │   └── page.tsx        # Dashboard UI
│   ├── components/ui/      # Reusable component library
│   ├── lib/                # Core logic (infetrix.ts, workloads-store.ts)
│   └── db/                 # PostgreSQL schema + pgvector migration
├── docs/                   # Architecture documentation
└── scripts/                # Deployment and benchmark scripts
```

## Security

- **No hardcoded credentials**: All provider keys are user-supplied at runtime
- **Key redaction**: API responses mask sensitive data (`sk-...abc`)
- **Input validation**: Request body limits, endpoint URL validation
- **Environment isolation**: `.env*` files excluded from version control

## Roadmap

- [ ] Additional providers: Vast.ai, Modal, Lambda Labs, Together AI
- [ ] Mojo/MAX optimization layer for pre-dispatch model optimization
- [ ] Request caching with semantic similarity matching
- [ ] Cost analytics dashboard with historical trends
- [ ] Multi-tenant API with project-level isolation
- [ ] Automated provider health monitoring

## Contributing

Contributions welcome. Please open an issue first to discuss proposed changes.

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built by <a href="https://github.com/urbanherak">@urbanherak</a>
</p>
