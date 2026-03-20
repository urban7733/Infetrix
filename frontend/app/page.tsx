"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, Gauge, Loader2, Radar, Sparkles, Trash2, Waypoints, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Policy = "balanced" | "cost" | "latency";
type RunStatus = "idle" | "loading" | "success" | "error";

type WorkloadSummary = {
  id: string;
  name: string;
  model: string;
  mode: "route" | "infer";
  policy: Policy;
  provider_count: number;
  workload_profile_preview: string;
  traffic_profile?: string;
  current_cost_per_1k?: number;
  projected_cost_per_1k?: number;
  estimated_savings_percent?: number;
  active_levers: string[];
  latency_sla_ms?: number;
  created_at: string;
  updated_at: string;
};

type RankingItem = {
  name: string;
  total_score: number;
  cost_score: number;
  latency_score: number;
  availability_score: number;
  price_per_1k_tokens: number;
  avg_latency_ms: number;
};

type OptimizationLever = {
  title: string;
  effect: string;
  detail: string;
};

type ComputeLane = {
  title: string;
  hardware: string;
  role: string;
  reason: string;
};

type BenchmarkGate = {
  metric: string;
  target: string;
  note: string;
};

type RuntimeStage = {
  title: string;
  stack: string;
  detail: string;
};

type BenchmarkLane = {
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

type OptimizerRecommendation = {
  primary_lane: string;
  shadow_lane: string;
  rationale: string;
};

type OptimizationPlan = {
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

type RunResult = {
  request_id: string;
  workload_id: string;
  workload_name: string;
  model: string;
  mode: "route" | "infer";
  policy: Policy;
  optimization_plan: OptimizationPlan;
  selected_provider: {
    name: string;
    endpoint: string;
    api_key_preview: string;
    total_score: number;
  };
  rankings: RankingItem[];
};

const policyOptions: Array<{ id: Policy; label: string; copy: string }> = [
  {
    id: "balanced",
    label: "Balanced",
    copy: "Cut spend hard without moving the product feel.",
  },
  {
    id: "cost",
    label: "Max savings",
    copy: "Push caching, quantization, and traffic shaping aggressively.",
  },
  {
    id: "latency",
    label: "Low latency",
    copy: "Keep the fast path pinned while cheaper lanes take the rest.",
  },
];

const emptyLevers: OptimizationLever[] = [
  {
    title: "KV Cache-Aware Routing",
    effect: "Keeps warm context attached to the cheapest valid replica",
    detail: "Repeated prompts and follow-up turns should hit a warm lane instead of paying prefill cost again.",
  },
  {
    title: "Continuous Batching",
    effect: "Lifts throughput without moving the user-visible latency envelope",
    detail: "Token-time batching turns idle accelerator capacity into lower blended cost.",
  },
  {
    title: "Disaggregated Prefill / Decode",
    effect: "Separates expensive context ingest from cheaper generation",
    detail: "Long prompts and steady decode should not live on the same economic path.",
  },
  {
    title: "Adaptive FP8 / Quantization",
    effect: "Shrinks memory traffic only where evals and latency still hold",
    detail: "Lower precision is allowed on safe lanes and rolled back instantly when it risks quality.",
  },
  {
    title: "SLA-Aware Autoscaling",
    effect: "Protects latency without paying for empty replicas all day",
    detail: "Scale behavior should follow the latency contract, not static headroom guesses.",
  },
];

const emptyFabric: ComputeLane[] = [
  {
    title: "Mojo Runtime Layer",
    hardware: "Mojo + MAX",
    role: "Cross-lane specialization layer for scheduler and kernel-adjacent hot paths.",
    reason: "Mojo stays inside the system even when the serving accelerator changes.",
  },
  {
    title: "Open-Weight Anchor Lane",
    hardware: "AMD MI300X",
    role: "Memory-rich path for larger contexts and larger open-weight models.",
    reason: "A memory-heavy AMD lane reduces dependence on CUDA-only deployment shapes.",
  },
  {
    title: "Elastic Alternate Cloud",
    hardware: "Google TPU v5e / Trillium",
    role: "Second-cloud serving path for overflow and vendor diversification.",
    reason: "A TPU lane gives the control plane a real non-GPU-only escape hatch.",
  },
  {
    title: "Premium Fast Path",
    hardware: "NVIDIA only if benchmark wins",
    role: "Optional specialization for models or kernels that materially beat the open fabric.",
    reason: "CUDA should be an optimization choice, not the product dependency.",
  },
];

const emptyBenchmarkGates: BenchmarkGate[] = [
  {
    metric: "Quality parity",
    target: "No regression on evals or human review.",
    note: "Cheaper is irrelevant if answer quality slips.",
  },
  {
    metric: "Hot-path latency",
    target: "P95 must stay inside the existing SLA envelope.",
    note: "Same-speed is a release gate.",
  },
  {
    metric: "Blended cost",
    target: "Count infra overhead, cache misses, and spillover before claiming victory.",
    note: "Kernel-only numbers are not enough.",
  },
];

const emptyRuntimeStack: RuntimeStage[] = [
  {
    title: "Ingress",
    stack: "Own API workload intake",
    detail: "The full workload should enter through your control plane before any hardware decision is made.",
  },
  {
    title: "Planner",
    stack: "Benchmark scorer + cache-aware router",
    detail: "Lane choice should be driven by latency, quality, blended cost, and lock-in score instead of vendor habit.",
  },
  {
    title: "Kernel Fast Path",
    stack: "Mojo/MAX custom operations",
    detail: "Mojo stays in the hot path for specialization, scheduler logic, and kernel-adjacent acceleration.",
  },
  {
    title: "Release Gate",
    stack: "Eval + latency + cost validation",
    detail: "Claims only ship once the lane clears all three gates together.",
  },
];

const emptyBenchmarkMatrix: BenchmarkLane[] = [
  {
    id: "mi300x_mojo",
    lane: "Mojo Fast Path",
    hardware: "AMD MI300X",
    runtime: "ROCm vLLM + Mojo/MAX custom kernels",
    mojo_path: "Mojo custom kernels stay on the hot prefill and scheduling path.",
    ttft_ms: 265,
    decode_tokens_per_second: 225,
    blended_cost_per_1k: 0.044,
    quality_score: 97,
    lock_in_score: 94,
    overall_score: 92,
    status: "ship",
    notes: ["Illustrative benchmark lane before a workload is selected."],
  },
  {
    id: "inf2_decode",
    lane: "Neuron Decode Lane",
    hardware: "AWS Inferentia2",
    runtime: "Neuron serving + continuous batching",
    mojo_path: "Mojo remains in routing and planner logic.",
    ttft_ms: 305,
    decode_tokens_per_second: 205,
    blended_cost_per_1k: 0.041,
    quality_score: 95,
    lock_in_score: 88,
    overall_score: 88,
    status: "shadow",
    notes: ["Illustrative benchmark lane before a workload is selected."],
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatCost(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `$${value.toFixed(3)}/1k`;
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(0)}%`;
}

function statusLabel(status: RunStatus): string {
  if (status === "loading") return "Mapping";
  if (status === "success") return "Dashboard Live";
  if (status === "error") return "Needs Attention";
  return "Ready";
}

function buildApiPreview(args: {
  name: string;
  model: string;
  policy: Policy;
  currentCostPer1K: number;
  latencySLA: number;
  trafficProfile: string;
  workloadProfile: string;
  sampleInput: string;
}): string {
  return JSON.stringify(
    {
      action: "create",
      name: args.name.trim() || "support-copilot",
      model: args.model.trim() || "llama-3.1-8b-instruct",
      mode: "route",
      policy: args.policy,
      current_cost_per_1k: args.currentCostPer1K,
      latency_sla_ms: args.latencySLA,
      traffic_profile: args.trafficProfile.trim(),
      workload_profile: args.workloadProfile.trim(),
      sample_input: args.sampleInput.trim(),
    },
    null,
    2,
  );
}

export default function Home() {
  const [workloadName, setWorkloadName] = useState("Support Copilot");
  const [model, setModel] = useState("llama-3.1-8b-instruct");
  const [policy, setPolicy] = useState<Policy>("balanced");
  const [currentCostPer1K, setCurrentCostPer1K] = useState(0.094);
  const [latencySLA, setLatencySLA] = useState(420);
  const [trafficProfile, setTrafficProfile] = useState("900 rpm steady, 4x launch spikes, EU + US traffic");
  const [workloadProfile, setWorkloadProfile] = useState(
    "Paste the full workload here: prompt chain, retrieval pattern, traffic shape, context length, and any quality guardrails the product cannot break.",
  );
  const [sampleInput, setSampleInput] = useState("A customer asks whether we support SOC 2, SSO, and EU data residency.");

  const [workloads, setWorkloads] = useState<WorkloadSummary[]>([]);
  const [selectedWorkloadID, setSelectedWorkloadID] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runError, setRunError] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  const selectedWorkload = workloads.find((workload) => workload.id === selectedWorkloadID) ?? null;
  const averageSavings =
    workloads.length > 0
      ? workloads.reduce((sum, workload) => sum + (workload.estimated_savings_percent ?? 0), 0) / workloads.length
      : undefined;

  const previewSavings = policy === "cost" ? 58 : policy === "latency" ? 29 : 44;
  const previewProjected = Number((currentCostPer1K * (1 - previewSavings / 100)).toFixed(3));
  const dashboardPlan = runResult?.optimization_plan ?? null;
  const displaySavings = dashboardPlan?.estimated_savings_percent ?? averageSavings ?? previewSavings;
  const displayProjectedCost = dashboardPlan?.projected_cost_per_1k ?? selectedWorkload?.projected_cost_per_1k ?? previewProjected;
  const displayLatency = dashboardPlan?.latency_guardrail_ms ?? selectedWorkload?.latency_sla_ms ?? latencySLA;
  const displayLevers = dashboardPlan?.active_levers ?? emptyLevers;
  const displayFabric = dashboardPlan?.compute_fabric ?? emptyFabric;
  const displayBenchmarkGates = dashboardPlan?.benchmark_gates ?? emptyBenchmarkGates;
  const displayRuntimeStack = dashboardPlan?.runtime_stack ?? emptyRuntimeStack;
  const displayBenchmarkMatrix = dashboardPlan?.benchmark_matrix ?? emptyBenchmarkMatrix;
  const displayRecommendation = dashboardPlan?.recommendation ?? null;
  const displayTargetStatus =
    dashboardPlan?.cost_target_status ?? "The 50% cost-down goal is benchmark-gated. It only counts if quality and latency stay flat.";
  const apiPreview = buildApiPreview({
    name: workloadName,
    model,
    policy,
    currentCostPer1K,
    latencySLA,
    trafficProfile,
    workloadProfile,
    sampleInput,
  });

  async function fetchWorkloads(preferredID?: string): Promise<void> {
    try {
      const response = await fetch("/v1/workloads", { cache: "no-store" });
      const data = (await response.json()) as { workloads?: WorkloadSummary[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Failed to load workloads.");
      }

      const nextWorkloads = Array.isArray(data.workloads) ? data.workloads : [];
      setWorkloads(nextWorkloads);
      setSelectedWorkloadID((current) => {
        if (preferredID && nextWorkloads.some((workload) => workload.id === preferredID)) return preferredID;
        if (current && nextWorkloads.some((workload) => workload.id === current)) return current;
        return nextWorkloads[0]?.id ?? "";
      });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Failed to load workloads.");
    }
  }

  useEffect(() => {
    void fetchWorkloads();
  }, []);

  useEffect(() => {
    if (!selectedWorkloadID) {
      setRunResult(null);
      setRunStatus("idle");
      return;
    }

    void runSelectedWorkload(selectedWorkloadID);
  }, [selectedWorkloadID]);

  async function createWorkload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setRunError("");

    if (!workloadName.trim() || !model.trim() || !workloadProfile.trim()) {
      setRunError("Name, model, and full workload payload are required.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/v1/workloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: workloadName.trim(),
          model: model.trim(),
          mode: "route",
          policy,
          current_cost_per_1k: currentCostPer1K,
          latency_sla_ms: latencySLA,
          traffic_profile: trafficProfile.trim(),
          workload_profile: workloadProfile.trim(),
          sample_input: sampleInput.trim(),
        }),
      });

      const data = (await response.json()) as { error?: string; workload?: WorkloadSummary };
      if (!response.ok) {
        throw new Error(data.error || "Failed to create workload.");
      }

      await fetchWorkloads(data.workload?.id);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Failed to create workload.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteWorkload(workloadID: string): Promise<void> {
    setRunError("");

    try {
      const response = await fetch("/v1/workloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", workload_id: workloadID }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete workload.");
      }

      if (selectedWorkloadID === workloadID) {
        setRunResult(null);
      }
      await fetchWorkloads();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Failed to delete workload.");
    }
  }

  async function runSelectedWorkload(workloadID: string): Promise<void> {
    setRunStatus("loading");
    setRunError("");

    try {
      const response = await fetch("/v1/workloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          workload_id: workloadID,
        }),
      });

      const data = (await response.json()) as RunResult & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to map workload.");
      }

      setRunResult(data);
      setRunStatus("success");
    } catch (error) {
      setRunStatus("error");
      setRunResult(null);
      setRunError(error instanceof Error ? error.message : "Failed to map workload.");
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="noise" />
      <div className="orb orb-left" />
      <div className="orb orb-right" />

      <div className="relative z-10 mx-auto w-full max-w-[1320px] space-y-6">
        <header className="glass rounded-3xl p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="outline">Infetrix</Badge>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">No Sign-In</Badge>
              <Badge variant="secondary">50% Cost-Down Target</Badge>
              <Badge variant="secondary">Mojo Inside</Badge>
              <Badge variant="secondary">NVIDIA Optional</Badge>
              <Badge variant="secondary">Benchmark-Gated</Badge>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_0.85fr] lg:items-end">
            <div>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Drop the full workload in once. Infetrix turns it into an open inference fabric that targets at least
                50% lower cost with the same user-visible speed.
              </h1>
              <p className="mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
                No login wall. No provider maze. Users hand us the complete workload through one payload, and the
                dashboard maps cache-aware routing, batching, split prefill/decode, Mojo kernel paths, and a
                cloud-agnostic hardware mix where NVIDIA is a fallback lane, not the default dependency.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/12 bg-black/35 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Access</p>
                <p className="mt-1 text-xl font-semibold">Open</p>
              </div>
              <div className="rounded-2xl border border-white/12 bg-black/35 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Cost-Down Goal</p>
                <p className="mt-1 text-xl font-semibold">&gt;=50%</p>
              </div>
              <div className="rounded-2xl border border-white/12 bg-black/35 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Compute Posture</p>
                <p className="mt-1 text-xl font-semibold">Open Fabric</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Workload Intake</CardTitle>
                <CardDescription>
                  One intake, one API payload, one dashboard. The low-level provider setup is gone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={createWorkload}>
                  <section className="rounded-2xl border border-white/12 bg-black/35 p-4">
                    <p className="section-label">Identity</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input value={workloadName} onChange={(event) => setWorkloadName(event.target.value)} placeholder="Workload name" />
                      <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model family" />
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <Input
                        type="number"
                        step="0.001"
                        value={currentCostPer1K}
                        onChange={(event) => setCurrentCostPer1K(Number(event.target.value))}
                        placeholder="Current $ / 1k"
                      />
                      <Input
                        type="number"
                        min="1"
                        value={latencySLA}
                        onChange={(event) => setLatencySLA(Number(event.target.value))}
                        placeholder="Latency SLA ms"
                      />
                      <Input
                        value={trafficProfile}
                        onChange={(event) => setTrafficProfile(event.target.value)}
                        placeholder="Traffic profile"
                      />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/12 bg-black/35 p-4">
                    <p className="section-label">Optimization Bias</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {policyOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setPolicy(option.id)}
                          className={`rounded-2xl border p-4 text-left transition-all ${
                            policy === option.id ? "border-white/55 bg-white/12" : "border-white/12 bg-black/45 hover:bg-black/55"
                          }`}
                        >
                          <p className="text-sm font-semibold">{option.label}</p>
                          <p className="mt-2 text-xs leading-5 text-zinc-400">{option.copy}</p>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/12 bg-black/35 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Waypoints className="h-4 w-4" />
                      <p className="text-sm font-medium">Complete Workload</p>
                    </div>
                    <Textarea
                      value={workloadProfile}
                      onChange={(event) => setWorkloadProfile(event.target.value)}
                      placeholder="Paste the complete workload, prompt chain, tools, retrieval pattern, and non-negotiable quality requirements."
                    />
                    <Textarea
                      className="mt-3"
                      value={sampleInput}
                      onChange={(event) => setSampleInput(event.target.value)}
                      placeholder="Representative request"
                    />
                  </section>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" size="lg" disabled={isSaving}>
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Activate Dashboard
                    </Button>
                    <p className="text-sm text-zinc-500">The dashboard is public-facing here. Users do not need to sign in first.</p>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Workloads</CardTitle>
                <CardDescription>Fewer objects, less setup, and a live optimization view for each saved workload.</CardDescription>
              </CardHeader>
              <CardContent>
                {workloads.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/12 bg-black/25 p-5">
                    <p className="text-sm text-zinc-400">No workloads yet. Submit one payload above and the dashboard will turn on immediately.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {workloads.map((workload) => {
                      const selected = workload.id === selectedWorkloadID;
                      return (
                        <div
                          key={workload.id}
                          className={`rounded-2xl border p-4 transition-all ${
                            selected ? "border-white/55 bg-white/12" : "border-white/12 bg-black/45"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button type="button" className="flex-1 text-left" onClick={() => setSelectedWorkloadID(workload.id)}>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold">{workload.name}</p>
                                <Badge variant="secondary">{workload.policy}</Badge>
                                <Badge variant="secondary">{workload.mode}</Badge>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-zinc-400">
                                {workload.workload_profile_preview || workload.traffic_profile || "Saved workload intake"}
                              </p>
                              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                                  <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Spend</p>
                                  <p className="mt-1 text-sm font-semibold">{formatCost(workload.current_cost_per_1k)}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                                  <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Projected</p>
                                  <p className="mt-1 text-sm font-semibold">{formatCost(workload.projected_cost_per_1k)}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                                  <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Savings</p>
                                  <p className="mt-1 text-sm font-semibold">{formatPercent(workload.estimated_savings_percent)}</p>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {workload.active_levers.slice(0, 3).map((lever) => (
                                  <Badge key={lever} variant="outline" className="text-[10px]">
                                    {lever}
                                  </Badge>
                                ))}
                              </div>
                            </button>

                            <Button type="button" size="icon" variant="ghost" onClick={() => void deleteWorkload(workload.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="h-fit xl:sticky xl:top-6">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Optimization Dashboard</CardTitle>
                    <CardDescription>Same output bar, same speed discipline, and an accelerator-neutral plan instead of a CUDA-only story.</CardDescription>
                  </div>
                  <Badge variant="secondary">{statusLabel(runStatus)}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {runError ? <div className="rounded-2xl border border-white/20 bg-white/10 p-3 text-sm text-white">{runError}</div> : null}

                <section className="rounded-2xl border border-white/12 bg-black/45 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="section-label !mb-1">Current Selection</p>
                      <p className="text-lg font-semibold">{runResult?.workload_name || selectedWorkload?.name || "Draft preview"}</p>
                    </div>
                    {selectedWorkloadID ? (
                      <Button type="button" variant="outline" onClick={() => void runSelectedWorkload(selectedWorkloadID)} disabled={runStatus === "loading"}>
                        {runStatus === "loading" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Radar className="mr-2 h-4 w-4" />
                        )}
                        Refresh
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {dashboardPlan?.summary ||
                      "Paste the workload once and Infetrix will surface the cheaper lane mix, active levers, and the protected latency envelope."}
                  </p>
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/40 p-3 text-sm text-zinc-300">{displayTargetStatus}</div>
                </section>

                <section className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/12 bg-black/45 p-4">
                    <p className="section-label !mb-1">Current Spend</p>
                    <p className="text-xl font-semibold">{formatCost(dashboardPlan?.current_cost_per_1k ?? currentCostPer1K)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-black/45 p-4">
                    <p className="section-label !mb-1">Projected Spend</p>
                    <p className="text-xl font-semibold">{formatCost(displayProjectedCost)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-black/45 p-4">
                    <p className="section-label !mb-1">Savings Locked</p>
                    <p className="text-xl font-semibold">{formatPercent(displaySavings)}</p>
                  </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/12 bg-black/45 p-4">
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="h-4 w-4" />
                      <p className="text-sm font-medium">Quality</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">
                      {dashboardPlan?.quality_posture ||
                        "Output quality stays fixed. Infetrix only turns on cheaper execution paths where the quality guardrail holds."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-black/45 p-4">
                    <div className="flex items-center gap-2">
                      <Gauge className="h-4 w-4" />
                      <p className="text-sm font-medium">Speed</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">
                      {dashboardPlan?.speed_posture ||
                        "Fast capacity stays reserved for the path users feel, while lower-cost lanes absorb the background load."}
                    </p>
                  </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/12 bg-black/45 p-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      <p className="text-sm font-medium">Lock-In Posture</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">
                      {dashboardPlan?.lock_in_posture ||
                        "The control plane should stay cloud-agnostic and accelerator-aware, with NVIDIA reserved for lanes that measurably win."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-black/45 p-4">
                    <div className="flex items-center gap-2">
                      <Waypoints className="h-4 w-4" />
                      <p className="text-sm font-medium">Deployment Posture</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">
                      {dashboardPlan?.deployment_posture ||
                        "Hybrid and multi-cloud should be the default planning posture so burst traffic never creates a vendor hostage situation."}
                    </p>
                  </div>
                </section>

                <section className="rounded-2xl border border-white/12 bg-black/45 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Radar className="h-4 w-4" />
                    <p className="text-sm font-medium">Optimizer Recommendation</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
                      <p className="section-label !mb-1">Primary Lane</p>
                      <p className="text-sm font-semibold">{displayRecommendation?.primary_lane || "Mojo Fast Path on AMD MI300X"}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
                      <p className="section-label !mb-1">Shadow Lane</p>
                      <p className="text-sm font-semibold">{displayRecommendation?.shadow_lane || "Neuron Decode Lane on AWS Inferentia2"}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {displayRecommendation?.rationale ||
                      "Primary and shadow lanes should both stay live so the optimizer can prove the economics instead of locking into one accelerator too early."}
                  </p>
                </section>

                <section className="rounded-2xl border border-white/12 bg-black/45 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <p className="text-sm font-medium">Active Cost Levers</p>
                  </div>
                  <div className="space-y-3">
                    {displayLevers.map((lever) => (
                      <div key={lever.title} className="rounded-2xl border border-white/10 bg-black/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{lever.title}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">{lever.effect}</p>
                          </div>
                          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                        </div>
                        <p className="mt-3 text-sm leading-6 text-zinc-400">{lever.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/12 bg-black/45 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Waypoints className="h-4 w-4" />
                    <p className="text-sm font-medium">Runtime Stack</p>
                  </div>
                  <div className="space-y-3">
                    {displayRuntimeStack.map((stage) => (
                      <div key={stage.title} className="rounded-2xl border border-white/10 bg-black/40 p-3">
                        <p className="text-sm font-semibold">{stage.title}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">{stage.stack}</p>
                        <p className="mt-3 text-sm leading-6 text-zinc-400">{stage.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/12 bg-black/45 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Radar className="h-4 w-4" />
                    <p className="text-sm font-medium">Open Compute Fabric</p>
                  </div>
                  <div className="space-y-3">
                    {displayFabric.map((lane) => (
                      <div key={lane.title} className="rounded-2xl border border-white/10 bg-black/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{lane.title}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">{lane.hardware}</p>
                          </div>
                          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                        </div>
                        <p className="mt-3 text-sm leading-6 text-zinc-300">{lane.role}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">{lane.reason}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/12 bg-black/45 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Gauge className="h-4 w-4" />
                    <p className="text-sm font-medium">Benchmark Matrix</p>
                  </div>
                  <p className="mb-3 text-sm leading-6 text-zinc-400">
                    {dashboardPlan?.benchmark_source || "infetrix-reference-benchmark-catalog@2026-03-20 (4 runs)"}
                  </p>
                  <div className="space-y-3">
                    {displayBenchmarkMatrix.map((lane) => (
                      <div key={lane.id} className="rounded-2xl border border-white/10 bg-black/40 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{lane.lane}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">{lane.hardware}</p>
                          </div>
                          <Badge variant={lane.status === "ship" ? "default" : lane.status === "shadow" ? "secondary" : "outline"}>{lane.status}</Badge>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-zinc-300">{lane.runtime}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">{lane.mojo_path}</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-4">
                          <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">TTFT</p>
                            <p className="mt-1 text-sm font-semibold">{lane.ttft_ms}ms</p>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Decode</p>
                            <p className="mt-1 text-sm font-semibold">{lane.decode_tokens_per_second} tok/s</p>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Blended Cost</p>
                            <p className="mt-1 text-sm font-semibold">{formatCost(lane.blended_cost_per_1k)}</p>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Score</p>
                            <p className="mt-1 text-sm font-semibold">{lane.overall_score.toFixed(0)}</p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {lane.notes.map((note) => (
                            <p key={note} className="text-sm leading-6 text-zinc-400">
                              {note}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/12 bg-black/45 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4" />
                    <p className="text-sm font-medium">Benchmark Gates</p>
                  </div>
                  <div className="space-y-3">
                    {displayBenchmarkGates.map((gate) => (
                      <div key={gate.metric} className="rounded-2xl border border-white/10 bg-black/40 p-3">
                        <p className="text-sm font-semibold">{gate.metric}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-300">{gate.target}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">{gate.note}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/12 bg-black/45 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Waypoints className="h-4 w-4" />
                    <p className="text-sm font-medium">Own API Payload</p>
                  </div>
                  <p className="mb-3 text-sm leading-6 text-zinc-400">
                    Users hand over the whole workload once. That is the product entry now. No sign-in step is required, and the control plane can stay cloud-agnostic from the first payload.
                  </p>
                  <pre className="max-h-[22rem] overflow-auto rounded-2xl border border-white/10 bg-black/60 p-3 text-xs text-zinc-200">
                    {apiPreview}
                  </pre>
                </section>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
