# Mojo/MAX Optimization Playbook (Cost Down, Speed Flat or Better)

Date: 2026-02-25

## Objective

Ship an optimization path that reduces inference cost by at least 30% while keeping latency equal or better than baseline.

## What the latest docs imply

1. Quantization is the primary cost lever.
- Use supported MAX quantization encodings (for example GPTQ and Q4_K families) to reduce memory and improve throughput.

2. Prefix caching is already enabled by default in MAX Serve.
- Keep it enabled and shape traffic to maximize prefix reuse.

3. Throughput optimizers in MAX Serve matter for price/perf.
- In-flight batching and chunked prefill are key toggles.
- Tune memory pressure with `--device-memory-utilization`.

4. Warm the cache before benchmark runs.
- Use `max warm-cache` to avoid measuring cold-start artifact.

5. Benchmark with MAX benchmark and compare real latency metrics.
- Track `TTFT`, `TPOT`, `ITL`, and end-to-end latency distributions.

6. Speculative decoding is promising but marked preview in docs.
- Keep it behind a feature flag until it proves stable in A/B.

## Rollout Sequence

1. Baseline (no aggressive tuning)
- Prefix caching on (default)
- In-flight batching on
- Chunked prefill off
- No speculative decoding

2. Tuned profile
- Quantized model variant
- Prefix caching on
- In-flight batching on
- Chunked prefill on
- `--device-memory-utilization` tuned (start at 0.92)

3. Optional aggressive profile (guarded)
- Tuned profile + speculative decoding

## Acceptance Gates

Promote a profile only if all are true:

- Cost per 1K tokens <= baseline * 0.70
- p95 end-to-end latency <= baseline p95
- TTFT p95 <= baseline TTFT p95
- Error rate does not increase by more than 0.2 percentage points

## Infetrix Integration Plan

1. Add optimizer profile field in request metadata (`baseline`, `tuned`, `aggressive`).
2. Add benchmark snapshots per provider/model/profile.
3. Route using projected score from benchmark snapshots, not raw static estimates.
4. Keep fallback to baseline profile when quality or latency SLA breaks.

## Command Templates

Server startup template:

```bash
max serve \
  --model-path "$MODEL_PATH" \
  --port 8000 \
  --batch-timeout 0 \
  --max-num-steps 10 \
  --device-memory-utilization 0.92
```

Warm cache template:

```bash
max warm-cache --model-path "$MODEL_PATH"
```

Benchmark template:

```bash
max benchmark \
  --model "$MODEL_PATH" \
  --dataset-name sharegpt \
  --num-prompts 200 \
  --output-file "$OUT_JSON"
```
