import { RankedProvider } from "@/lib/infetrix";
import { benchmarkCatalog, benchmarkCatalogSummary } from "@/lib/benchmark-catalog";
import { Workload } from "@/lib/workloads-store";

export type OptimizationLever = {
  title: string;
  effect: string;
  detail: string;
};

export type ComputeLane = {
  title: string;
  hardware: string;
  role: string;
  reason: string;
};

export type BenchmarkGate = {
  metric: string;
  target: string;
  note: string;
};

export type RuntimeStage = {
  title: string;
  stack: string;
  detail: string;
};

export type BenchmarkLane = {
  id: string;
  lane: string;
  hardware: string;
  runtime: string;
  mojo_path: string;
  ttft_ms: number;
  decode_tokens_per_second: number;
  blended_cost_per_1k: number;
  quality_score: number;
  lock_in_score: number;
  overall_score: number;
  status: "ship" | "shadow" | "hold";
  notes: string[];
};

export type OptimizerRecommendation = {
  primary_lane: string;
  shadow_lane: string;
  rationale: string;
};

export type OptimizationPlan = {
  summary: string;
  current_cost_per_1k: number;
  projected_cost_per_1k: number;
  estimated_savings_percent: number;
  latency_guardrail_ms: number;
  cost_target_percent: number;
  cost_target_status: string;
  quality_posture: string;
  speed_posture: string;
  lock_in_posture: string;
  deployment_posture: string;
  benchmark_source: string;
  active_levers: OptimizationLever[];
  compute_fabric: ComputeLane[];
  benchmark_gates: BenchmarkGate[];
  runtime_stack: RuntimeStage[];
  benchmark_matrix: BenchmarkLane[];
  recommendation: OptimizerRecommendation;
};

type WorkloadSignals = {
  repeatHeavy: boolean;
  burstHeavy: boolean;
  agentic: boolean;
  longContext: boolean;
  latencyGuardrail: number;
  latencyTight: boolean;
};

const REFERENCE_BASELINE_COST = 0.094;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasKeyword(value: string, terms: string[]): boolean {
  const normalized = value.trim().toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function formatCurrencyTarget(value: number): string {
  return `$${value.toFixed(3)}/1k`;
}

function fallbackCurrentCost(workload: Workload): number {
  const providerPrices = workload.providers.map((provider) => provider.price_per_1k_tokens);
  if (providerPrices.length === 0) return 0.09;

  const maxPrice = Math.max(...providerPrices);
  const avgPrice = providerPrices.reduce((sum, value) => sum + value, 0) / providerPrices.length;
  return round4(Math.max(workload.budget_per_1k ?? 0, maxPrice * 1.55, avgPrice * 1.75, 0.09));
}

function detectSignals(workload: Workload): WorkloadSignals {
  const combinedText = [workload.workload_profile, workload.traffic_profile, workload.sample_input].filter(Boolean).join(" ");
  const latencyGuardrail = workload.latency_sla_ms ?? 480;

  return {
    repeatHeavy: hasKeyword(combinedText, ["faq", "support", "copilot", "docs", "knowledge", "retrieval", "catalog", "repeat"]),
    burstHeavy: hasKeyword(combinedText, ["burst", "spike", "launch", "campaign", "peak", "queue", "batch"]),
    agentic: hasKeyword(combinedText, ["tool", "agent", "workflow", "multi-step", "reasoning"]),
    longContext: (workload.workload_profile || "").length > 320 || (workload.sample_input || "").length > 140,
    latencyGuardrail,
    latencyTight: latencyGuardrail <= 350,
  };
}

function benchmarkScore(
  policy: Workload["policy"],
  speedScore: number,
  costScore: number,
  qualityScore: number,
  lockInScore: number,
): number {
  if (policy === "cost") return round2(costScore * 0.42 + speedScore * 0.22 + qualityScore * 0.21 + lockInScore * 0.15);
  if (policy === "latency") return round2(speedScore * 0.42 + qualityScore * 0.26 + costScore * 0.2 + lockInScore * 0.12);
  return round2(speedScore * 0.3 + costScore * 0.28 + qualityScore * 0.24 + lockInScore * 0.18);
}

function buildRuntimeStack(signals: WorkloadSignals, recommendation: OptimizerRecommendation): RuntimeStage[] {
  return [
    {
      title: "Ingress",
      stack: "Own API workload intake",
      detail: "The full workload enters through your control plane once, so optimization is centralized before any accelerator is chosen.",
    },
    {
      title: "Planner",
      stack: "Cache-aware router + benchmark scorer",
      detail: "The scheduler scores candidate lanes against latency, blended cost, quality, and lock-in rather than routing blindly by vendor.",
    },
    {
      title: "Kernel Fast Path",
      stack: "Mojo/MAX custom operations",
      detail: signals.longContext
        ? "Mojo stays on the hot prefill, prompt packing, and scheduler path where custom kernels can move latency and memory traffic."
        : "Mojo stays on the hottest scheduling and kernel hooks so the runtime can specialize without changing the product surface.",
    },
    {
      title: "Serving Lane",
      stack: recommendation.primary_lane,
      detail: "The top benchmark-clearing lane serves production traffic, while the shadow lane continues to collect evidence behind it.",
    },
    {
      title: "Release Gate",
      stack: "Eval + latency + blended-cost checks",
      detail: "A lane only ships if quality holds, p95 fits the SLA, and the claimed savings survive infra overhead.",
    },
  ];
}

function buildBenchmarkMatrix(
  workload: Workload,
  signals: WorkloadSignals,
  baselineCost: number,
  costTargetPercent: number,
): { benchmark_matrix: BenchmarkLane[]; recommendation: OptimizerRecommendation } {
  const lanes = benchmarkCatalog.runs.map((run) => {
    let ttft = run.ttft_ms;
    let decodeTps = run.decode_tokens_per_second;
    let costFraction = run.blended_cost_per_1k / REFERENCE_BASELINE_COST;
    let quality = run.quality_score;

    if (signals.longContext) {
      ttft += run.id === "mi300x_mojo" ? 35 : run.id === "nvidia_mojo" ? 48 : 75;
      decodeTps += run.id === "mi300x_mojo" ? 12 : run.id === "nvidia_mojo" ? 8 : -6;
      costFraction += run.id === "mi300x_mojo" ? -0.02 : 0.03;
    }

    if (signals.repeatHeavy) {
      ttft += run.id === "mi300x_mojo" ? -28 : -18;
      costFraction -= run.id === "inf2_decode" ? 0.05 : 0.03;
    }

    if (signals.burstHeavy) {
      decodeTps += run.id === "inf2_decode" ? 18 : run.id === "tpu_elastic" ? 14 : 10;
      costFraction -= run.id === "inf2_decode" ? 0.03 : 0.01;
    }

    if (signals.agentic) {
      quality += run.id === "nvidia_mojo" ? 1 : 0;
      costFraction += run.id === "inf2_decode" ? 0.04 : 0.02;
      decodeTps -= run.id === "tpu_elastic" ? 8 : 4;
    }

    if (signals.latencyTight) {
      ttft += run.id === "nvidia_mojo" ? -18 : run.id === "mi300x_mojo" ? -10 : 12;
      costFraction += run.id === "nvidia_mojo" ? 0.04 : 0.02;
    }

    const blendedCost = round4(Math.max(baselineCost * clamp(costFraction, 0.3, 0.92), 0.018));
    const ttftClamped = Math.max(140, Math.round(ttft));
    const speedScore = round2(
      clamp(((signals.latencyGuardrail * 1.18 - ttftClamped) / Math.max(signals.latencyGuardrail * 0.9, 1)) * 55 + decodeTps / 4, 0, 100),
    );
    const costScore = round2(clamp((1 - blendedCost / baselineCost) * 130, 0, 100));
    const qualityScore = round2(clamp(quality, 0, 100));
    const lockInScore = round2(clamp(run.lock_in_score, 0, 100));
    const overall = benchmarkScore(workload.policy, speedScore, costScore, qualityScore, lockInScore);
    const savings = round2((1 - blendedCost / baselineCost) * 100);

    let status: BenchmarkLane["status"] = "hold";
    if (qualityScore >= 95 && ttftClamped <= signals.latencyGuardrail && savings >= costTargetPercent - 8) status = "ship";
    else if (qualityScore >= 94 && ttftClamped <= signals.latencyGuardrail * 1.08) status = "shadow";

    return {
      id: run.id,
      lane: run.lane,
      hardware: run.hardware,
      runtime: run.runtime,
      mojo_path: run.mojo_path,
      ttft_ms: ttftClamped,
      decode_tokens_per_second: Math.round(decodeTps),
      blended_cost_per_1k: blendedCost,
      quality_score: qualityScore,
      lock_in_score: lockInScore,
      overall_score: overall,
      status,
      notes: [
        `Catalog source: ${benchmarkCatalog.source} ${benchmarkCatalog.version}.`,
        `Projected savings: ${savings.toFixed(0)}% vs current blended cost.`,
        ttftClamped <= signals.latencyGuardrail
          ? `TTFT clears the ${signals.latencyGuardrail} ms guardrail.`
          : `TTFT misses the ${signals.latencyGuardrail} ms guardrail and needs shadow validation.`,
      ],
    };
  });

  lanes.sort((a, b) => b.overall_score - a.overall_score);
  const shippable = lanes.filter((lane) => lane.status === "ship");
  const shadowable = lanes.filter((lane) => lane.status === "shadow");
  const primary = shippable[0] ?? lanes[0];
  const shadow = shippable[1] ?? shadowable[0] ?? lanes[1] ?? primary;

  return {
    benchmark_matrix: lanes,
    recommendation: {
      primary_lane: `${primary.lane} on ${primary.hardware}`,
      shadow_lane: `${shadow.lane} on ${shadow.hardware}`,
      rationale:
        primary.id === "mi300x_mojo"
          ? "Mojo stays in the critical path and AMD clears the cost/perf trade while keeping the control plane off CUDA lock-in."
          : primary.id === "inf2_decode"
            ? "Inferentia2 wins the decode economics, with Mojo retained in planning and orchestration while AMD or TPU stay ready as shadow capacity."
            : primary.id === "tpu_elastic"
              ? "TPU gives the cleanest non-CUDA latency/cost shape here, while Mojo remains part of the router and kernel-adjacent control path."
              : "CUDA only wins here because the measured speed edge is large enough to justify it, while Mojo still owns the custom fast path layer.",
    },
  };
}

export function workloadProfilePreview(value: string | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  return raw.length <= 150 ? raw : `${raw.slice(0, 147)}...`;
}

export function buildOptimizationPlan(workload: Workload, rankings: RankedProvider[]): OptimizationPlan {
  const signals = detectSignals(workload);
  const baselineCost = workload.current_cost_per_1k ?? fallbackCurrentCost(workload);
  const cheapestLane = rankings[0]?.provider.price_per_1k_tokens ?? Math.max(baselineCost * 0.55, 0.03);
  const costTargetPercent = 50;
  const policySavings = workload.policy === "cost" ? 0.48 : workload.policy === "latency" ? 0.26 : 0.39;
  const repeatSavings = signals.repeatHeavy ? 0.1 : 0.05;
  const burstSavings = signals.burstHeavy ? 0.07 : 0.03;
  const promptSavings = signals.longContext ? 0.06 : 0.03;
  const agenticPenalty = signals.agentic ? 0.04 : 0;
  const latencyPenalty = signals.latencyTight ? 0.07 : 0;
  const savingsFraction = clamp(policySavings + repeatSavings + burstSavings + promptSavings - latencyPenalty - agenticPenalty, 0.22, 0.74);
  const projectedFloor = round4(cheapestLane * (signals.latencyTight ? 1.08 : 0.92));
  const projectedCost = round4(Math.max(projectedFloor, baselineCost * (1 - savingsFraction)));
  const estimatedSavingsPercent = round2(clamp((1 - projectedCost / baselineCost) * 100, 8, 72));
  const optimizer = buildBenchmarkMatrix(workload, signals, baselineCost, costTargetPercent);
  const catalogMeta = benchmarkCatalogSummary();

  const levers: OptimizationLever[] = [
    {
      title: "KV Cache-Aware Routing",
      effect: signals.repeatHeavy ? "Raises cache-hit rate on repeated turns and RAG prompts" : "Keeps warm context attached to the cheapest valid replica",
      detail: "Requests are routed toward replicas that already hold useful context so prefill work is not repaid on every turn.",
    },
    {
      title: "Continuous Batching",
      effect: signals.burstHeavy ? "Turns spiky traffic into higher accelerator utilization" : "Increases throughput without changing the user-facing latency target",
      detail: "The serving lane batches opportunistically at token time so idle accelerator slots are converted into cheaper output tokens.",
    },
    {
      title: "Disaggregated Prefill / Decode",
      effect: signals.longContext ? "Separates long-context ingest from cheap steady-state generation" : "Prevents decode latency from paying for cold prefill work",
      detail: "Prompt ingestion and token generation are treated as different cost problems and assigned to different lanes.",
    },
    {
      title: "Adaptive FP8 / Quantization",
      effect: signals.latencyTight ? "Cuts memory traffic while preserving the hot path" : "Drops blended serving cost through lower precision on safe traffic",
      detail: "Lower precision is enabled only when the eval and latency gates hold, with immediate fallback for risky requests.",
    },
    {
      title: "SLA-Aware Autoscaling",
      effect: signals.burstHeavy ? "Spins capacity up for spikes and drains idle cost fast" : "Keeps the latency envelope without paying for empty replicas",
      detail: "Scale decisions follow the target SLA and concurrency budget instead of crude replica counts.",
    },
    {
      title: "Mojo Kernel Fast Path",
      effect: "Keeps Mojo inside the hottest path instead of treating it like optional copy",
      detail: "Mojo and MAX custom operations stay in the planner, prefill, and kernel-adjacent path so the optimizer can keep specializing around real bottlenecks.",
    },
  ];

  const computeFabric: ComputeLane[] = [
    {
      title: "Mojo Runtime Layer",
      hardware: "Mojo + MAX",
      role: "Cross-lane kernel and scheduler specialization layer that stays above the hardware choice.",
      reason: "Mojo remains part of the core runtime, not an optional experiment bolted on later.",
    },
    {
      title: signals.longContext ? "Memory-Heavy Context Lane" : "Open-Weight Anchor Lane",
      hardware: "AMD MI300X",
      role: signals.longContext ? "Hold large prompts, big KV footprints, and larger open weights with less sharding pain." : "Anchor larger open-weight serving on a non-CUDA memory-rich lane.",
      reason: "High-memory AMD lanes reduce dependence on CUDA-specific deployment shapes for big-context work.",
    },
    {
      title: "Steady-State Decode",
      hardware: "AWS Inferentia2",
      role: "Primary low-cost token generation lane for dense open-weight traffic.",
      reason: "Use Neuron-backed serving where it clears the latency gate, so NVIDIA is not the default spend sink.",
    },
    {
      title: signals.latencyTight ? "Low-Latency Alternate Cloud" : "Elastic Alternate Cloud",
      hardware: "Google TPU v5e / Trillium",
      role: signals.latencyTight ? "Serve a second fast lane without tying the stack to one accelerator vendor." : "Provide overflow and diversification capacity outside GPU-only infrastructure.",
      reason: "TPU serving with vLLM and Ray provides a real non-CUDA inference path with batching and PagedAttention.",
    },
    {
      title: "Premium Fast Path",
      hardware: "NVIDIA only if benchmark wins",
      role: "Keep CUDA-specific kernels as an optional specialization rather than the platform foundation.",
      reason: "The control plane stays accelerator-neutral and only routes to CUDA when TTFT, throughput, or quality measurably wins.",
    },
  ];

  return {
    summary:
      "Infetrix turns the workload into an accelerator-neutral runtime plan: cache-aware routing, batching, split prefill/decode, and open compute lanes with NVIDIA as fallback instead of default.",
    current_cost_per_1k: round4(baselineCost),
    projected_cost_per_1k: projectedCost,
    estimated_savings_percent: estimatedSavingsPercent,
    latency_guardrail_ms: signals.latencyGuardrail,
    cost_target_percent: costTargetPercent,
    cost_target_status:
      estimatedSavingsPercent >= costTargetPercent
        ? "The current paper plan clears the 50% cost-down target. Benchmark it and lock it in."
        : `Current plan lands at ${estimatedSavingsPercent.toFixed(0)}% on paper. To clear 50%, push harder on cache-hit rate, hardware mix, or prompt shrink.`,
    quality_posture: "Quality stays pinned to the current bar with guarded route shifts, eval gates, and instant fallback for risky requests.",
    speed_posture: signals.latencyTight
      ? "Fast-path latency stays inside the current SLA while cheaper non-CUDA lanes absorb safe traffic and overflow."
      : "Users keep the same speed envelope while the control plane moves the bulk path onto cheaper hardware and warmer caches.",
    lock_in_posture:
      "The control plane is cloud-agnostic and accelerator-aware. NVIDIA stays available, but only as a benchmarked fast path, not as the architectural default.",
    deployment_posture:
      signals.burstHeavy || signals.latencyTight
        ? "Run a hybrid baseline with geo-aware, SLA-aware spillover across clouds so capacity and cost stay flexible."
        : "Default to self-hosted or BYO-cloud base capacity, then burst across clouds only when the economics stay favorable.",
    benchmark_source: `${catalogMeta.source}@${catalogMeta.version} (${catalogMeta.run_count} runs)`,
    active_levers: levers,
    compute_fabric: computeFabric,
    benchmark_gates: [
      {
        metric: "Quality parity",
        target: "No regression on task evals or human review against the current baseline.",
        note: "Cheaper lanes do not ship if they hurt answer quality, tool success, or safety behavior.",
      },
      {
        metric: "Hot-path latency",
        target: `P95 stays inside ${signals.latencyGuardrail} ms or your existing production envelope.`,
        note: "Same-speed is a hard release gate, not a positioning line.",
      },
      {
        metric: "Blended cost",
        target: `Hit or beat ${costTargetPercent}% below ${formatCurrencyTarget(baselineCost)} with idle, spillover, and cache misses included.`,
        note: "Claim the number only after infra overhead is counted, not just kernel-level token cost.",
      },
    ],
    runtime_stack: buildRuntimeStack(signals, optimizer.recommendation),
    benchmark_matrix: optimizer.benchmark_matrix,
    recommendation: optimizer.recommendation,
  };
}
