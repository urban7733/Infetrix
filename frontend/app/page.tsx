"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Cpu, Gauge, Loader2, Play, Plus, Server, SlidersHorizontal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Policy = "balanced" | "cost" | "latency";
type Mode = "route" | "infer";
type RunStatus = "idle" | "loading" | "success" | "error";

type ProviderDraft = {
  id: "runpod" | "huggingface";
  label: string;
  name: string;
  endpoint: string;
  apiKey: string;
  enabled: boolean;
  price: number;
  latency: number;
  availability: number;
};

type WorkloadSummary = {
  id: string;
  name: string;
  model: string;
  mode: Mode;
  policy: Policy;
  provider_count: number;
  budget_per_1k?: number;
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
};

type RunResult = {
  request_id: string;
  workload_id: string;
  workload_name: string;
  mode: Mode;
  selected_provider: {
    name: string;
    endpoint: string;
    api_key_preview: string;
    total_score: number;
  };
  rankings: RankingItem[];
  provider_status?: number;
  provider_response?: unknown;
};

const draftProviders: ProviderDraft[] = [
  {
    id: "runpod",
    label: "RunPod",
    name: "runpod",
    endpoint: "https://api.runpod.ai/v2/YOUR_ENDPOINT/runsync",
    apiKey: "",
    enabled: true,
    price: 0.024,
    latency: 420,
    availability: 0.99,
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    name: "huggingface",
    endpoint: "https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-8B-Instruct",
    apiKey: "",
    enabled: true,
    price: 0.03,
    latency: 380,
    availability: 0.98,
  },
];

function cloneProviders(): ProviderDraft[] {
  return draftProviders.map((provider) => ({ ...provider }));
}

function asNum(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function statusLabel(status: RunStatus): string {
  if (status === "loading") return "Running";
  if (status === "success") return "Success";
  if (status === "error") return "Failed";
  return "Idle";
}

export default function Home() {
  const [workloadName, setWorkloadName] = useState("primary-router");
  const [model, setModel] = useState("llama-3.1-8b-instruct");
  const [mode, setMode] = useState<Mode>("infer");
  const [policy, setPolicy] = useState<Policy>("balanced");
  const [maxTokens, setMaxTokens] = useState(128);
  const [temperature, setTemperature] = useState(0.7);
  const [budgetPer1K, setBudgetPer1K] = useState(0.03);
  const [latencySLA, setLatencySLA] = useState(800);
  const [sampleInput, setSampleInput] = useState("Write one crisp line announcing a launch.");
  const [testInput, setTestInput] = useState("Run a quick quality check response.");
  const [providers, setProviders] = useState<ProviderDraft[]>(() => cloneProviders());

  const [workloads, setWorkloads] = useState<WorkloadSummary[]>([]);
  const [selectedWorkloadID, setSelectedWorkloadID] = useState("");

  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runError, setRunError] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [responsePreview, setResponsePreview] = useState("No run yet.");

  const activeProviders = useMemo(() => providers.filter((provider) => provider.enabled), [providers]);

  async function fetchWorkloads(): Promise<void> {
    const response = await fetch("/v1/workloads", { cache: "no-store" });
    const data = (await response.json()) as { workloads?: WorkloadSummary[] };
    setWorkloads(Array.isArray(data.workloads) ? data.workloads : []);
  }

  useEffect(() => {
    void fetchWorkloads();
  }, []);

  function updateProvider(id: ProviderDraft["id"], patch: Partial<ProviderDraft>): void {
    setProviders((prev) => prev.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider)));
  }

  function resetDraft(): void {
    setWorkloadName("primary-router");
    setModel("llama-3.1-8b-instruct");
    setMode("infer");
    setPolicy("balanced");
    setMaxTokens(128);
    setTemperature(0.7);
    setBudgetPer1K(0.03);
    setLatencySLA(800);
    setSampleInput("Write one crisp line announcing a launch.");
    setProviders(cloneProviders());
  }

  async function createWorkload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setRunError("");

    if (!workloadName.trim() || !model.trim()) {
      setRunError("Workload name and model are required.");
      return;
    }
    if (activeProviders.length === 0) {
      setRunError("Enable at least one provider.");
      return;
    }

    if (mode === "infer") {
      const missingKey = activeProviders.find((provider) => !provider.apiKey.trim());
      if (missingKey) {
        setRunError(`${missingKey.label}: API key is required in infer mode.`);
        return;
      }
    }

    const payload = {
      action: "create",
      name: workloadName.trim(),
      model: model.trim(),
      mode,
      policy,
      max_tokens: Math.max(1, Math.floor(asNum(maxTokens, 128))),
      temperature: clamp(asNum(temperature, 0.7), 0, 2),
      budget_per_1k: asNum(budgetPer1K, 0.03),
      latency_sla_ms: Math.max(1, Math.floor(asNum(latencySLA, 800))),
      sample_input: sampleInput.trim(),
      providers: activeProviders.map((provider) => ({
        name: provider.name,
        endpoint: provider.endpoint.trim(),
        api_key: provider.apiKey.trim(),
        price_per_1k_tokens: asNum(provider.price, 0.02),
        avg_latency_ms: Math.max(1, Math.floor(asNum(provider.latency, 350))),
        availability: clamp(asNum(provider.availability, 0.99), 0, 1),
      })),
    };

    const response = await fetch("/v1/workloads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { error?: string; workload?: WorkloadSummary };
    if (!response.ok) {
      setRunError(data.error || "Failed to create workload.");
      return;
    }

    await fetchWorkloads();
    if (data.workload?.id) {
      setSelectedWorkloadID(data.workload.id);
    }
    setRunStatus("idle");
    setRunResult(null);
    setResponsePreview("No run yet.");
  }

  async function deleteWorkload(workloadID: string): Promise<void> {
    const response = await fetch("/v1/workloads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", workload_id: workloadID }),
    });
    if (!response.ok) return;

    if (selectedWorkloadID === workloadID) {
      setSelectedWorkloadID("");
    }
    await fetchWorkloads();
  }

  async function runSelectedWorkload(): Promise<void> {
    setRunError("");
    if (!selectedWorkloadID) {
      setRunStatus("error");
      setRunError("Select a workload first.");
      return;
    }

    setRunStatus("loading");

    const response = await fetch("/v1/workloads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "execute",
        workload_id: selectedWorkloadID,
        input: testInput.trim(),
      }),
    });

    const data = (await response.json()) as RunResult & { error?: string };
    if (!response.ok) {
      setRunStatus("error");
      setRunError(data.error || "Workload execution failed.");
      return;
    }

    setRunStatus("success");
    setRunResult(data);
    setResponsePreview(JSON.stringify(data.provider_response ?? { note: "No provider response payload." }, null, 2));
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
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Workload-first</Badge>
              <Badge variant="secondary">BYOK Router</Badge>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Pure black control layer for cheaper and faster model execution.
              </h1>
              <p className="mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Create workload profiles once. Execute by workload ID. Routing policy and provider economics are handled
                in one minimal interface.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/12 bg-black/35 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Workloads</p>
                <p className="mt-1 text-xl font-semibold">{workloads.length}</p>
              </div>
              <div className="rounded-2xl border border-white/12 bg-black/35 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Providers</p>
                <p className="mt-1 text-xl font-semibold">{activeProviders.length}</p>
              </div>
              <div className="rounded-2xl border border-white/12 bg-black/35 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Run State</p>
                <p className="mt-1 text-xl font-semibold">{statusLabel(runStatus)}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.26fr_0.74fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Workload Blueprint</CardTitle>
                <CardDescription>
                  Define model, routing objective, provider credentials, and runtime defaults.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={createWorkload}>
                  <section className="rounded-2xl border border-white/12 bg-black/35 p-4">
                    <p className="section-label">Identity</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input value={workloadName} onChange={(event) => setWorkloadName(event.target.value)} placeholder="Workload name" />
                      <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model" />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/12 bg-black/35 p-4">
                    <p className="section-label">Strategy</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant={mode === "infer" ? "default" : "outline"} onClick={() => setMode("infer")}>
                          <Cpu className="mr-2 h-4 w-4" />
                          Infer
                        </Button>
                        <Button type="button" variant={mode === "route" ? "default" : "outline"} onClick={() => setMode("route")}>
                          <Gauge className="mr-2 h-4 w-4" />
                          Route
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {(["balanced", "cost", "latency"] as Policy[]).map((p) => (
                          <Button
                            key={p}
                            type="button"
                            variant={policy === p ? "default" : "outline"}
                            onClick={() => setPolicy(p)}
                            className="capitalize"
                          >
                            {p}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/12 bg-black/35 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      <p className="text-sm font-medium">Providers</p>
                    </div>

                    <div className="space-y-3">
                      {providers.map((provider) => (
                        <div key={provider.id} className="rounded-xl border border-white/12 bg-black/45 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{provider.label}</p>
                              <p className="text-xs text-zinc-500">{provider.endpoint}</p>
                            </div>

                            <Button
                              type="button"
                              variant={provider.enabled ? "secondary" : "outline"}
                              onClick={() => updateProvider(provider.id, { enabled: !provider.enabled })}
                            >
                              {provider.enabled ? "Enabled" : "Disabled"}
                            </Button>
                          </div>

                          {provider.enabled ? (
                            <div className="mt-3 space-y-2">
                              <Input
                                type="password"
                                placeholder={`${provider.label} API key`}
                                value={provider.apiKey}
                                onChange={(event) => updateProvider(provider.id, { apiKey: event.target.value })}
                              />

                              <div className="grid grid-cols-3 gap-2">
                                <Input
                                  type="number"
                                  step="0.001"
                                  value={provider.price}
                                  onChange={(event) => updateProvider(provider.id, { price: Number(event.target.value) })}
                                  placeholder="$/1k"
                                />
                                <Input
                                  type="number"
                                  value={provider.latency}
                                  onChange={(event) => updateProvider(provider.id, { latency: Number(event.target.value) })}
                                  placeholder="ms"
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  max="1"
                                  step="0.001"
                                  value={provider.availability}
                                  onChange={(event) => updateProvider(provider.id, { availability: Number(event.target.value) })}
                                  placeholder="avail"
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/12 bg-black/35 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4" />
                      <p className="text-sm font-medium">Constraints & Defaults</p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input type="number" min="1" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} placeholder="Max tokens" />
                      <Input type="number" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} placeholder="Temperature" />
                      <Input type="number" step="0.001" value={budgetPer1K} onChange={(event) => setBudgetPer1K(Number(event.target.value))} placeholder="Budget cap $/1k" />
                      <Input type="number" min="1" value={latencySLA} onChange={(event) => setLatencySLA(Number(event.target.value))} placeholder="Latency SLA ms" />
                    </div>

                    <Textarea
                      className="mt-2"
                      value={sampleInput}
                      onChange={(event) => setSampleInput(event.target.value)}
                      placeholder="Optional default input for infer workloads"
                    />
                  </section>

                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="lg">
                      <Plus className="mr-2 h-4 w-4" />
                      Save Workload
                    </Button>
                    <Button type="button" size="lg" variant="outline" onClick={resetDraft}>
                      Reset Draft
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Saved Workloads</CardTitle>
                <CardDescription>Reusable workload profiles with IDs for repeated execution.</CardDescription>
              </CardHeader>
              <CardContent>
                {workloads.length === 0 ? (
                  <p className="text-sm text-zinc-500">No workloads yet.</p>
                ) : (
                  <div className="space-y-2">
                    {workloads.map((workload) => {
                      const selected = workload.id === selectedWorkloadID;
                      return (
                        <div
                          key={workload.id}
                          className={`rounded-xl border p-3 ${selected ? "border-white/55 bg-white/12" : "border-white/12 bg-black/45"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button type="button" className="text-left" onClick={() => setSelectedWorkloadID(workload.id)}>
                              <p className="text-sm font-semibold">{workload.name}</p>
                              <p className="text-xs text-zinc-500">
                                {workload.model} · {workload.mode} · {workload.policy} · {workload.provider_count} providers
                              </p>
                              <p className="mt-1 text-[11px] text-zinc-500">ID: {workload.id}</p>
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

          <div className="xl:sticky xl:top-6 h-fit">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Execute</CardTitle>
                    <CardDescription>Run selected workload with optional test input.</CardDescription>
                  </div>
                  <Badge variant="secondary">{statusLabel(runStatus)}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-white/12 bg-black/45 p-3">
                  <p className="section-label !mb-1">Selected Workload ID</p>
                  <p className="truncate text-sm">{selectedWorkloadID || "none"}</p>
                </div>

                <Textarea
                  value={testInput}
                  onChange={(event) => setTestInput(event.target.value)}
                  placeholder="Optional test input; falls back to workload sample input"
                />

                <Button size="lg" className="w-full" onClick={() => void runSelectedWorkload()} disabled={runStatus === "loading"}>
                  {runStatus === "loading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  Run Selected Workload
                </Button>

                {runError ? <div className="rounded-xl border border-white/20 bg-white/10 p-3 text-sm text-white">{runError}</div> : null}

                <div className="divider-soft" />

                <section className="rounded-2xl border border-white/12 bg-black/45 p-4">
                  <p className="section-label">Selected Provider</p>
                  {runResult ? (
                    <>
                      <p className="text-lg font-semibold">{runResult.selected_provider.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">Score: {runResult.selected_provider.total_score.toFixed(4)}</p>
                      <p className="mt-1 text-xs text-zinc-500">Endpoint: {runResult.selected_provider.endpoint}</p>
                      <p className="mt-1 text-xs text-zinc-500">Key preview: {runResult.selected_provider.api_key_preview}</p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-500">No run yet.</p>
                  )}
                </section>

                <section className="rounded-2xl border border-white/12 bg-black/45 p-4">
                  <p className="section-label">Ranking</p>
                  {runResult?.rankings?.length ? (
                    <div className="space-y-2">
                      {runResult.rankings.map((item) => {
                        const width = clamp(Math.round(item.total_score * 100), 0, 100);
                        return (
                          <div key={item.name}>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span>{item.name}</span>
                              <span className="text-zinc-500">{item.total_score.toFixed(4)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-white" style={{ width: `${width}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No ranking data yet.</p>
                  )}
                </section>

                <section className="rounded-2xl border border-white/12 bg-black/45 p-4">
                  <p className="section-label">Provider Response</p>
                  <pre className="max-h-[22rem] overflow-auto rounded-xl border border-white/10 bg-black/60 p-3 text-xs text-zinc-200">
                    {responsePreview}
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
