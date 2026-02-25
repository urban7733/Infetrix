#!/usr/bin/env python3
import json
import sys


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def pick(metrics, keys):
    for key in keys:
        if key in metrics and isinstance(metrics[key], (int, float)):
            return float(metrics[key]), key
    return None, None


def pct_change(new, old):
    if old == 0:
        return 0.0
    return ((new - old) / old) * 100.0


def main():
    if len(sys.argv) != 3:
        print("Usage: compare.py <baseline.json> <tuned.json>")
        sys.exit(1)

    baseline = load(sys.argv[1])
    tuned = load(sys.argv[2])

    cost_keys = ["cost_per_1k_tokens", "cost_per_1k", "usd_per_1k_tokens"]
    p95_keys = ["latency_p95_ms", "e2e_latency_p95_ms", "p95_latency_ms"]
    ttft_keys = ["ttft_p95_ms", "p95_ttft_ms"]

    b_cost, b_cost_key = pick(baseline, cost_keys)
    t_cost, t_cost_key = pick(tuned, cost_keys)
    b_p95, b_p95_key = pick(baseline, p95_keys)
    t_p95, t_p95_key = pick(tuned, p95_keys)
    b_ttft, b_ttft_key = pick(baseline, ttft_keys)
    t_ttft, t_ttft_key = pick(tuned, ttft_keys)

    print("Comparison:")
    if b_cost is not None and t_cost is not None:
        delta = pct_change(t_cost, b_cost)
        print(f"- Cost ({b_cost_key} -> {t_cost_key}): {b_cost:.4f} -> {t_cost:.4f} ({delta:.2f}%)")
    else:
        print("- Cost: metric key not found in one or both files")

    if b_p95 is not None and t_p95 is not None:
        delta = pct_change(t_p95, b_p95)
        print(f"- p95 latency ({b_p95_key} -> {t_p95_key}): {b_p95:.2f} -> {t_p95:.2f} ms ({delta:.2f}%)")
    else:
        print("- p95 latency: metric key not found in one or both files")

    if b_ttft is not None and t_ttft is not None:
        delta = pct_change(t_ttft, b_ttft)
        print(f"- TTFT p95 ({b_ttft_key} -> {t_ttft_key}): {b_ttft:.2f} -> {t_ttft:.2f} ms ({delta:.2f}%)")
    else:
        print("- TTFT p95: metric key not found in one or both files")

    passes = True
    if b_cost is not None and t_cost is not None:
        passes = passes and t_cost <= (b_cost * 0.70)
    if b_p95 is not None and t_p95 is not None:
        passes = passes and t_p95 <= b_p95
    if b_ttft is not None and t_ttft is not None:
        passes = passes and t_ttft <= b_ttft

    print(f"- Gate result: {'PASS' if passes else 'FAIL'}")


if __name__ == "__main__":
    main()
