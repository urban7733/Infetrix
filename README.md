# infetrix

**API-first optimization layer for MAX-backed LLM serving**

Generate a MAX deployment plan, benchmark it, and keep the public inference surface small. The current product direction is to optimize the serving layer first, then expose a simpler control-plane API on top.

```
Your App  ──▶  Infetrix Control Plane  ──▶  [MAX-Optimized Runtime]  ──▶  GPU
```

[![Demo](https://img.shields.io/badge/demo-live-22c55e?style=flat-square)](https://frontend-three-peach-61.vercel.app)
[![Build](https://img.shields.io/github/actions/workflow/status/urban7733/Infetrix/ci.yml?style=flat-square&label=build)](https://github.com/urban7733/Infetrix/actions)
![Mojo](https://img.shields.io/badge/Mojo-MAX-ff6b35?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-15-000?style=flat-square)
![Go](https://img.shields.io/badge/Go-1.22-00ADD8?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)

---

## Why

Most teams overpay for inference because they deploy a raw model endpoint and stop there.

Infetrix is moving toward a simpler model: deploy an optimized MAX runtime and standardize the API layer around it.
- **Quantization** (Q4_K) — smaller models, faster inference
- **In-flight batching** — process multiple requests together
- **Prefix caching** — reuse computation for common prefixes
- **Chunked prefill** — stream tokens during generation

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  INFETRIX                                                       │
│                                                                 │
│  ┌──────────────┐    ┌─────────────────┐    ┌───────────────┐  │
│  │   Workload   │───▶│   Mojo/MAX      │───▶│   Provider    │  │
│  │   Manager    │    │   Optimizer     │    │   Dispatch    │  │
│  └──────────────┘    └─────────────────┘    └───────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
           RunPod          Modal         HuggingFace
```



## Optimization Profiles

| Profile | Quantization | Batching | Prefill | Savings |
|---------|--------------|----------|---------|---------|
| baseline | — | standard | off | 0% |
| tuned | Q4_K | in-flight | chunked | ~30% |
| aggressive | Q4_K | in-flight | chunked + speculative | ~40% |

All optimizations must pass acceptance gates:
- Cost ≤ baseline × 0.70
- p95 latency ≤ baseline
- TTFT p95 ≤ baseline

---

## Quick Start

```bash
git clone https://github.com/urban7733/Infetrix.git
cd Infetrix/frontend
npm install && npm run dev
```

Open http://localhost:3000

**Environment:**
```bash
DATABASE_URL=postgresql://...     # optional
```

---

## API

**Generate deployment plan:**
```bash
curl -X POST /v1/deploy-plan \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.1-8b","model_path":"/models/llama-3.1-8b-q4-k","profile":"tuned"}'
```

**Compare optimized benchmark vs baseline:**
```bash
python3 scripts/max/compare.py ./benchmarks/baseline.json ./benchmarks/tuned.json
```

---

## Stack

| | |
|-|-|
| Optimization | Mojo, MAX Engine |
| Frontend | Next.js 15, TypeScript, Tailwind |
| Backend | Go 1.22 |
| Database | PostgreSQL |

---

## Structure

```
infetrix/
├── frontend/
│   ├── app/v1/workloads/    # API routes
│   └── lib/
│       ├── infetrix.ts      # ranking
│       ├── optimizer.ts     # mojo client
│       └── workloads-store.ts
├── internal/
│   ├── provider/            # adapters
│   └── router/              # scoring
└── scripts/max/             # benchmarks
```

---

## Roadmap

- [ ] Speculative decoding
- [ ] Vast.ai, Modal, Lambda adapters
- [ ] Cost analytics
- [ ] Multi-tenant

---

MIT · [@urbanherak](https://github.com/urbanherak)
