"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2, Radar, Sparkles, Trash2, Waypoints, Zap } from "lucide-react";
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
  workload_profile_preview: string;
  traffic_profile?: string;
  current_cost_per_1k?: number;
  projected_cost_per_1k?: number;
  estimated_savings_percent?: number;
  active_levers: string[];
  latency_sla_ms?: number;
};

type OptimizationLever = {
  title: string;
  effect: string;
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
  overall_score: number;
  status: "ship" | "shadow" | "hold";
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
  cost_target_status: string;
  quality_posture: string;
  speed_posture: string;
  lock_in_posture: string;
  deployment_posture: string;
  active_levers: OptimizationLever[];
  benchmark_matrix: BenchmarkLane[];
  recommendation: OptimizerRecommendation;
};

type RunResult = {
  workload_name: string;
  optimization_plan: OptimizationPlan;
};

const policyOptions: Array<{ id: Policy; label: string; copy: string }> = [
  {
    id: "balanced",
    label: "Balanced",
    copy: "Reduce spend aggressively without changing how the product feels.",
  },
  {
    id: "cost",
    label: "Max savings",
    copy: "Push caching, batching, and quantization harder.",
  },
  {
    id: "latency",
    label: "Low latency",
    copy: "Protect the hot path and keep cheaper lanes behind it.",
  },
];

const emptyLevers: OptimizationLever[] = [
  {
    title: "KV Cache-Aware Routing",
    effect: "Reuse warm context before paying prefill cost again",
    detail: "Repeated turns should hit the cheapest valid warm lane instead of starting cold.",
  },
  {
    title: "Continuous Batching",
    effect: "Increase throughput without moving the UX latency envelope",
    detail: "Idle accelerator capacity gets turned into lower blended serving cost.",
  },
  {
    title: "Mojo Kernel Fast Path",
    effect: "Keep Mojo inside the hottest execution path",
    detail: "Mojo remains in the planner and kernel-adjacent path instead of being reduced to positioning copy.",
  },
];

const emptyBenchmarkMatrix: BenchmarkLane[] = [
  {
    id: "mi300x_mojo",
    lane: "Mojo Fast Path",
    hardware: "AMD MI300X",
    runtime: "ROCm vLLM + Mojo/MAX custom kernels",
    mojo_path: "Mojo stays on the hot prefill and scheduler path.",
    ttft_ms: 265,
    decode_tokens_per_second: 225,
    blended_cost_per_1k: 0.044,
    overall_score: 92,
    status: "ship",
  },
  {
    id: "inf2_decode",
    lane: "Neuron Decode Lane",
    hardware: "AWS Inferentia2",
    runtime: "Neuron serving + continuous batching",
    mojo_path: "Mojo remains in the planner and router.",
    ttft_ms: 305,
    decode_tokens_per_second: 205,
    blended_cost_per_1k: 0.041,
    overall_score: 88,
    status: "shadow",
  },
  {
    id: "tpu_elastic",
    lane: "Elastic TPU Lane",
    hardware: "Google TPU v5e",
    runtime: "vLLM + Ray on TPU",
    mojo_path: "Mojo keeps the routing layer accelerator-aware.",
    ttft_ms: 336,
    decode_tokens_per_second: 193,
    blended_cost_per_1k: 0.043,
    overall_score: 83,
    status: "hold",
  },
];

function formatCost(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `$${value.toFixed(3)}/1k`;
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(0)}%`;
}

function formatLatency(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${Math.round(value)} ms`;
}

function statusLabel(status: RunStatus): string {
  if (status === "loading") return "Mapping";
  if (status === "success") return "Live";
  if (status === "error") return "Needs attention";
  return "Ready";
}

function statusVariant(status: RunStatus): "outline" | "secondary" | "success" | "destructive" {
  if (status === "loading") return "secondary";
  if (status === "success") return "success";
  if (status === "error") return "destructive";
  return "outline";
}

function laneVariant(status: BenchmarkLane["status"]): "success" | "secondary" | "outline" {
  if (status === "ship") return "success";
  if (status === "shadow") return "secondary";
  return "outline";
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
    "Paste the full workload here: prompt chain, retrieval pattern, traffic shape, context length, and the quality floor you cannot break.",
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

  const previewSavings = policy === "cost" ? 58 : policy === "latency" ? 31 : 44;
  const previewProjected = Number((currentCostPer1K * (1 - previewSavings / 100)).toFixed(3));
  const dashboardPlan = runResult?.optimization_plan ?? null;
  const displaySavings = dashboardPlan?.estimated_savings_percent ?? selectedWorkload?.estimated_savings_percent ?? averageSavings ?? previewSavings;
  const displayProjectedCost = dashboardPlan?.projected_cost_per_1k ?? selectedWorkload?.projected_cost_per_1k ?? previewProjected;
  const displayLatency = dashboardPlan?.latency_guardrail_ms ?? selectedWorkload?.latency_sla_ms ?? latencySLA;
  const displayLevers = (dashboardPlan?.active_levers ?? emptyLevers).slice(0, 3);
  const displayMatrix = (dashboardPlan?.benchmark_matrix ?? emptyBenchmarkMatrix).slice(0, 3);
  const displayRecommendation = dashboardPlan?.recommendation ?? null;
  const displayTargetStatus =
    dashboardPlan?.cost_target_status ?? "The 50% cost-down goal stays benchmark-gated. It only counts if quality and latency hold.";
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
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_60px_rgba(15,23,42,0.06)] sm:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Infetrix</Badge>
                <Badge variant="secondary">No sign-in</Badge>
                <Badge variant="secondary">Mojo inside</Badge>
                <Badge variant="secondary">Benchmark-gated</Badge>
              </div>

              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
                Open workload intake for cheaper inference, without the provider maze.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
                Users hand you one complete workload payload. Infetrix maps the cheaper lane mix, keeps Mojo in the
                execution story, and treats NVIDIA as optional instead of architectural default.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="section-label">Access</p>
                  <p className="text-lg font-semibold text-zinc-950">Open dashboard</p>
                </div>
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="section-label">Cost target</p>
                  <p className="text-lg font-semibold text-zinc-950">&gt;= 50%</p>
                </div>
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="section-label">Compute posture</p>
                  <p className="text-lg font-semibold text-zinc-950">Open fabric</p>
                </div>
              </div>
            </div>

            <div className="w-full shrink-0 rounded-[28px] border border-zinc-200 bg-zinc-50 p-5 lg:max-w-sm">
              <p className="section-label">Release posture</p>
              <p className="text-3xl font-semibold text-zinc-950">{formatPercent(displaySavings)}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{displayTargetStatus}</p>

              <div className="mt-6 space-y-4">
                <div>
                  <p className="text-sm font-medium text-zinc-950">Quality</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    {dashboardPlan?.quality_posture || "Cheaper lanes only ship when answer quality stays at the current bar."}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-950">Speed</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    {dashboardPlan?.speed_posture || "Latency remains gated so savings never come from a degraded product feel."}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-950">Lock-in</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    {dashboardPlan?.lock_in_posture || "Keep the control plane portable and only use CUDA when measured results justify it."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.04fr)_380px]">
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Workload intake</CardTitle>
                <CardDescription>
                  Minimal input surface: one workload, one payload, one dashboard. No sign-in step and no exposed provider maze.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-6" onSubmit={createWorkload}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="section-label">Workload name</label>
                      <Input value={workloadName} onChange={(event) => setWorkloadName(event.target.value)} placeholder="Support Copilot" />
                    </div>
                    <div className="space-y-2">
                      <label className="section-label">Model family</label>
                      <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="llama-3.1-8b-instruct" />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <label className="section-label">Current cost / 1k</label>
                      <Input
                        type="number"
                        step="0.001"
                        value={currentCostPer1K}
                        onChange={(event) => setCurrentCostPer1K(Number(event.target.value))}
                        placeholder="0.094"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="section-label">Latency SLA</label>
                      <Input
                        type="number"
                        min="1"
                        value={latencySLA}
                        onChange={(event) => setLatencySLA(Number(event.target.value))}
                        placeholder="420"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="section-label">Traffic profile</label>
                      <Input
                        value={trafficProfile}
                        onChange={(event) => setTrafficProfile(event.target.value)}
                        placeholder="Traffic profile"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="section-label">Optimization bias</label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {policyOptions.map((option) => (
                        <Button
                          key={option.id}
                          type="button"
                          variant={policy === option.id ? "default" : "outline"}
                          className="h-auto min-h-28 items-start justify-start px-4 py-4 text-left"
                          onClick={() => setPolicy(option.id)}
                        >
                          <div>
                            <p className="text-sm font-semibold">{option.label}</p>
                            <p className={`mt-2 text-sm leading-6 ${policy === option.id ? "text-white/80" : "text-zinc-600"}`}>{option.copy}</p>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="section-label">Complete workload</label>
                    <Textarea
                      className="min-h-[170px]"
                      value={workloadProfile}
                      onChange={(event) => setWorkloadProfile(event.target.value)}
                      placeholder="Paste the full workload, prompt chain, retrieval pattern, tools, and quality requirements."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="section-label">Representative request</label>
                    <Textarea
                      className="min-h-[120px]"
                      value={sampleInput}
                      onChange={(event) => setSampleInput(event.target.value)}
                      placeholder="Representative request"
                    />
                  </div>

                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                    <Button type="submit" size="lg" disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Activate dashboard
                    </Button>
                    <Badge variant="secondary">Public dashboard, no sign-in required</Badge>
                  </div>

                  <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="section-label">Own API payload</p>
                        <p className="text-sm leading-6 text-zinc-600">Users hand over the whole workload once. That is the product entry.</p>
                      </div>
                      <Badge variant="outline">API-first</Badge>
                    </div>

                    <pre className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-4 text-xs leading-6 text-zinc-700">
                      {apiPreview}
                    </pre>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Saved workloads</CardTitle>
                <CardDescription>Short list, quick switch, immediate optimizer refresh.</CardDescription>
              </CardHeader>
              <CardContent>
                {workloads.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-zinc-300 bg-zinc-50 p-6">
                    <p className="text-sm leading-6 text-zinc-600">No workloads yet. Submit one payload above and the dashboard will turn on immediately.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {workloads.map((workload) => {
                      const selected = workload.id === selectedWorkloadID;

                      return (
                        <div
                          key={workload.id}
                          className={`rounded-[24px] border p-4 transition-colors ${
                            selected ? "border-zinc-950 bg-zinc-50" : "border-zinc-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedWorkloadID(workload.id)}>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-base font-semibold text-zinc-950">{workload.name}</p>
                                <Badge variant="outline">{workload.policy}</Badge>
                                <Badge variant="secondary">{workload.mode}</Badge>
                              </div>
                              <p className="mt-1 text-sm text-zinc-500">{workload.model}</p>
                              <p className="mt-3 text-sm leading-6 text-zinc-600">
                                {workload.workload_profile_preview || workload.traffic_profile || "Saved workload intake"}
                              </p>

                              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                  <p className="section-label !mb-1">Spend</p>
                                  <p className="text-sm font-semibold text-zinc-950">{formatCost(workload.current_cost_per_1k)}</p>
                                </div>
                                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                  <p className="section-label !mb-1">Projected</p>
                                  <p className="text-sm font-semibold text-zinc-950">{formatCost(workload.projected_cost_per_1k)}</p>
                                </div>
                                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                  <p className="section-label !mb-1">Savings</p>
                                  <p className="text-sm font-semibold text-zinc-950">{formatPercent(workload.estimated_savings_percent)}</p>
                                </div>
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

          <div className="min-w-0 xl:sticky xl:top-6">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Optimization dashboard</CardTitle>
                    <CardDescription>
                      Smaller surface, cleaner story, same optimization logic underneath.
                    </CardDescription>
                  </div>
                  <Badge variant={statusVariant(runStatus)}>{statusLabel(runStatus)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {runError ? (
                  <div className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">{runError}</div>
                ) : null}

                <section className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="section-label !mb-1">Current selection</p>
                      <p className="truncate text-lg font-semibold text-zinc-950">
                        {runResult?.workload_name || selectedWorkload?.name || "Draft preview"}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">{selectedWorkload?.model || model}</p>
                    </div>
                    {selectedWorkloadID ? (
                      <Button type="button" variant="outline" onClick={() => void runSelectedWorkload(selectedWorkloadID)} disabled={runStatus === "loading"}>
                        {runStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                        Refresh
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-zinc-600">
                    {dashboardPlan?.summary ||
                      "Paste one workload and Infetrix will surface the cheaper lane mix, the active levers, and the guarded latency envelope."}
                  </p>
                </section>

                <section className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-zinc-200 p-4">
                    <p className="section-label !mb-1">Current spend</p>
                    <p className="text-xl font-semibold text-zinc-950">{formatCost(dashboardPlan?.current_cost_per_1k ?? currentCostPer1K)}</p>
                  </div>
                  <div className="rounded-[24px] border border-zinc-200 p-4">
                    <p className="section-label !mb-1">Projected spend</p>
                    <p className="text-xl font-semibold text-zinc-950">{formatCost(displayProjectedCost)}</p>
                  </div>
                  <div className="rounded-[24px] border border-zinc-200 p-4">
                    <p className="section-label !mb-1">Savings</p>
                    <p className="text-xl font-semibold text-zinc-950">{formatPercent(displaySavings)}</p>
                  </div>
                  <div className="rounded-[24px] border border-zinc-200 p-4">
                    <p className="section-label !mb-1">Latency guardrail</p>
                    <p className="text-xl font-semibold text-zinc-950">{formatLatency(displayLatency)}</p>
                  </div>
                </section>

                <section className="rounded-[24px] border border-zinc-200 p-4">
                  <div className="flex items-center gap-2">
                    <Radar className="h-4 w-4 text-zinc-950" />
                    <p className="text-sm font-medium text-zinc-950">Recommendation</p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[20px] border border-zinc-200 bg-zinc-50 p-4">
                      <p className="section-label !mb-1">Primary lane</p>
                      <p className="text-sm font-semibold text-zinc-950">
                        {displayRecommendation?.primary_lane || "Mojo Fast Path on AMD MI300X"}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-zinc-200 bg-zinc-50 p-4">
                      <p className="section-label !mb-1">Shadow lane</p>
                      <p className="text-sm font-semibold text-zinc-950">
                        {displayRecommendation?.shadow_lane || "Neuron Decode Lane on AWS Inferentia2"}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-zinc-600">
                    {displayRecommendation?.rationale ||
                      "Keep a primary and a shadow lane alive so the optimizer proves the economics instead of locking into one accelerator too early."}
                  </p>
                </section>

                <section className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-zinc-200 p-4">
                    <p className="section-label !mb-1">Quality</p>
                    <p className="text-sm leading-6 text-zinc-600">
                      {dashboardPlan?.quality_posture || "Quality stays pinned while cheaper routes remain gated."}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-zinc-200 p-4">
                    <p className="section-label !mb-1">Speed</p>
                    <p className="text-sm leading-6 text-zinc-600">
                      {dashboardPlan?.speed_posture || "Same-speed claims only ship when the hot path remains protected."}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-zinc-200 p-4">
                    <p className="section-label !mb-1">Lock-in</p>
                    <p className="text-sm leading-6 text-zinc-600">
                      {dashboardPlan?.lock_in_posture || "Stay portable and use CUDA only when the benchmark actually wins."}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-zinc-200 p-4">
                    <p className="section-label !mb-1">Deployment</p>
                    <p className="text-sm leading-6 text-zinc-600">
                      {dashboardPlan?.deployment_posture || "Hybrid capacity remains available so the stack does not collapse into one vendor."}
                    </p>
                  </div>
                </section>

                <section className="rounded-[24px] border border-zinc-200 p-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-zinc-950" />
                    <p className="text-sm font-medium text-zinc-950">Top cost levers</p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {displayLevers.map((lever) => (
                      <div key={lever.title} className="rounded-[20px] border border-zinc-200 bg-zinc-50 p-4">
                        <p className="text-sm font-semibold text-zinc-950">{lever.title}</p>
                        <p className="mt-1 text-sm font-medium text-zinc-700">{lever.effect}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-600">{lever.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-[24px] border border-zinc-200 p-4">
                  <div className="flex items-center gap-2">
                    <Waypoints className="h-4 w-4 text-zinc-950" />
                    <p className="text-sm font-medium text-zinc-950">Benchmark lanes</p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {displayMatrix.map((lane) => (
                      <div key={lane.id} className="rounded-[20px] border border-zinc-200 bg-zinc-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-zinc-950">{lane.lane}</p>
                              <Badge variant={laneVariant(lane.status)}>{lane.status}</Badge>
                            </div>
                            <p className="mt-1 text-sm text-zinc-500">{lane.hardware}</p>
                          </div>
                          <p className="text-sm font-semibold text-zinc-950">{formatCost(lane.blended_cost_per_1k)}</p>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-zinc-600">{lane.runtime}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">{lane.mojo_path}</p>

                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                            <p className="section-label !mb-1">TTFT</p>
                            <p className="text-sm font-semibold text-zinc-950">{formatLatency(lane.ttft_ms)}</p>
                          </div>
                          <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                            <p className="section-label !mb-1">Decode</p>
                            <p className="text-sm font-semibold text-zinc-950">{lane.decode_tokens_per_second} tok/s</p>
                          </div>
                          <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                            <p className="section-label !mb-1">Score</p>
                            <p className="text-sm font-semibold text-zinc-950">{lane.overall_score.toFixed(0)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
