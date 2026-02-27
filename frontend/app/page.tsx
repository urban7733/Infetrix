"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Cpu,
  DollarSign,
  Gauge,
  Loader2,
  Play,
  Plus,
  Server,
  Trash2,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Policy = "balanced" | "cost" | "latency";
type Mode = "route" | "infer";
type RunStatus = "idle" | "loading" | "success" | "error";
type OptimizationProfile = "baseline" | "tuned" | "aggressive";

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
  optimization_profile: OptimizationProfile;
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
  optimization?: {
    profile: OptimizationProfile;
    projected_savings_pct: number;
    config: Record<string, unknown>;
  };
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
  if (status === "error") return "Error";
  return "Ready";
}

function statusVariant(status: RunStatus): "default" | "secondary" | "success" | "destructive" {
  if (status === "loading") return "secondary";
  if (status === "success") return "success";
  if (status === "error") return "destructive";
  return "outline" as "secondary";
}

export default function Home() {
  const [workloadName, setWorkloadName] = useState("primary-router");
  const [model, setModel] = useState("llama-3.1-8b-instruct");
  const [mode, setMode] = useState<Mode>("infer");
  const [policy, setPolicy] = useState<Policy>("balanced");
  const [optimizationProfile, setOptimizationProfile] = useState<OptimizationProfile>("tuned");
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
  const [responsePreview, setResponsePreview] = useState("");

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
    setOptimizationProfile("tuned");
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
      optimization_profile: optimizationProfile,
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
    setResponsePreview("");
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navigation */}
      <header className="border-b border-border bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <span className="text-xl font-semibold">Infetrix</span>
              </div>
              <nav className="hidden md:flex items-center gap-6">
                <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Dashboard
                </a>
                <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Docs
                </a>
                <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Pricing
                </a>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="hidden sm:flex">
                Beta
              </Badge>
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
              <Button size="sm">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-border bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="secondary">BYOK Router</Badge>
              <Badge variant="outline">Workload-first</Badge>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
              Intelligent model routing.
              <br />
              <span className="text-muted-foreground">Cut inference costs by 40%.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
              Create workload profiles once, execute by ID. Infetrix automatically routes to the fastest, cheapest provider based on your constraints.
            </p>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Server className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Workloads</span>
              </div>
              <p className="text-2xl font-semibold">{workloads.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Cpu className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Providers</span>
              </div>
              <p className="text-2xl font-semibold">{activeProviders.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Avg Savings</span>
              </div>
              <p className="text-2xl font-semibold">~40%</p>
            </div>
            <div className="rounded-xl border border-border bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Gauge className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Status</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(runStatus)}>{statusLabel(runStatus)}</Badge>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          {/* Left Column - Forms */}
          <div className="space-y-6">
            {/* Create Workload Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Create Workload</CardTitle>
                    <CardDescription>Define routing rules, provider credentials, and execution defaults.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form className="space-y-6" onSubmit={createWorkload}>
                  {/* Identity Section */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Identity</label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Input
                          value={workloadName}
                          onChange={(event) => setWorkloadName(event.target.value)}
                          placeholder="Workload name"
                        />
                      </div>
                      <div>
                        <Input
                          value={model}
                          onChange={(event) => setModel(event.target.value)}
                          placeholder="Model (e.g., llama-3.1-8b)"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Strategy Section */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Routing Strategy</label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={mode === "infer" ? "default" : "outline"}
                          onClick={() => setMode("infer")}
                          className="flex-1"
                        >
                          <Cpu className="h-4 w-4" />
                          Infer
                        </Button>
                        <Button
                          type="button"
                          variant={mode === "route" ? "default" : "outline"}
                          onClick={() => setMode("route")}
                          className="flex-1"
                        >
                          <Gauge className="h-4 w-4" />
                          Route
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        {(["balanced", "cost", "latency"] as Policy[]).map((p) => (
                          <Button
                            key={p}
                            type="button"
                            variant={policy === p ? "default" : "outline"}
                            onClick={() => setPolicy(p)}
                            className="flex-1 capitalize"
                            size="sm"
                          >
                            {p}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Optimization Section */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Mojo Optimization
                    </label>
                    <div className="flex gap-2">
                      {(["baseline", "tuned", "aggressive"] as OptimizationProfile[]).map((profile) => (
                        <Button
                          key={profile}
                          type="button"
                          variant={optimizationProfile === profile ? "default" : "outline"}
                          onClick={() => setOptimizationProfile(profile)}
                          className="flex-1 capitalize"
                          size="sm"
                        >
                          {profile}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {optimizationProfile === "baseline" && "Standard inference. No optimization applied."}
                      {optimizationProfile === "tuned" && "Quantization (Q4_K) + in-flight batching. ~30% cost reduction."}
                      {optimizationProfile === "aggressive" && "Tuned + speculative decoding. ~40% cost reduction."}
                    </p>
                  </div>

                  {/* Providers Section */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Providers</label>
                    <div className="space-y-3">
                      {providers.map((provider) => (
                        <div
                          key={provider.id}
                          className={`rounded-lg border p-4 transition-colors ${
                            provider.enabled ? "border-primary/20 bg-primary/5" : "border-border bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                                  provider.enabled ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                                }`}
                              >
                                <Server className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-medium">{provider.label}</p>
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {provider.endpoint}
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant={provider.enabled ? "default" : "outline"}
                              size="sm"
                              onClick={() => updateProvider(provider.id, { enabled: !provider.enabled })}
                            >
                              {provider.enabled ? (
                                <>
                                  <Check className="h-4 w-4" />
                                  Enabled
                                </>
                              ) : (
                                "Enable"
                              )}
                            </Button>
                          </div>

                          {provider.enabled && (
                            <div className="mt-4 space-y-3">
                              <Input
                                type="password"
                                placeholder={`${provider.label} API key`}
                                value={provider.apiKey}
                                onChange={(event) => updateProvider(provider.id, { apiKey: event.target.value })}
                              />
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-xs text-muted-foreground">Price/1k</label>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    value={provider.price}
                                    onChange={(event) => updateProvider(provider.id, { price: Number(event.target.value) })}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground">Latency (ms)</label>
                                  <Input
                                    type="number"
                                    value={provider.latency}
                                    onChange={(event) => updateProvider(provider.id, { latency: Number(event.target.value) })}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground">Availability</label>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={provider.availability}
                                    onChange={(event) => updateProvider(provider.id, { availability: Number(event.target.value) })}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Constraints Section */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Constraints</label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Max tokens</label>
                        <Input
                          type="number"
                          min="1"
                          value={maxTokens}
                          onChange={(event) => setMaxTokens(Number(event.target.value))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Temperature</label>
                        <Input
                          type="number"
                          min="0"
                          max="2"
                          step="0.1"
                          value={temperature}
                          onChange={(event) => setTemperature(Number(event.target.value))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Budget cap ($/1k)</label>
                        <Input
                          type="number"
                          step="0.001"
                          value={budgetPer1K}
                          onChange={(event) => setBudgetPer1K(Number(event.target.value))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Latency SLA (ms)</label>
                        <Input
                          type="number"
                          min="1"
                          value={latencySLA}
                          onChange={(event) => setLatencySLA(Number(event.target.value))}
                        />
                      </div>
                    </div>
                    <Textarea
                      value={sampleInput}
                      onChange={(event) => setSampleInput(event.target.value)}
                      placeholder="Default input for workload execution"
                      className="mt-2"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <Button type="submit" size="lg">
                      <Plus className="h-4 w-4" />
                      Save Workload
                    </Button>
                    <Button type="button" variant="outline" size="lg" onClick={resetDraft}>
                      Reset
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Saved Workloads */}
            <Card>
              <CardHeader>
                <CardTitle>Saved Workloads</CardTitle>
                <CardDescription>Select a workload to execute or manage.</CardDescription>
              </CardHeader>
              <CardContent>
                {workloads.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Server className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>No workloads yet. Create one above.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {workloads.map((workload) => {
                      const selected = workload.id === selectedWorkloadID;
                      return (
                        <div
                          key={workload.id}
                          className={`rounded-lg border p-4 cursor-pointer transition-all ${
                            selected
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:border-primary/40 hover:bg-muted/30"
                          }`}
                          onClick={() => setSelectedWorkloadID(workload.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-2 w-2 rounded-full ${selected ? "bg-primary" : "bg-muted-foreground/30"}`}
                              />
                              <div>
                                <p className="font-medium">{workload.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {workload.model} · {workload.optimization_profile || "baseline"} · {workload.provider_count}{" "}
                                  providers
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteWorkload(workload.id);
                              }}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground font-mono">{workload.id}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Execute Panel */}
          <div className="lg:sticky lg:top-24 h-fit">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Execute</CardTitle>
                    <CardDescription>Run the selected workload.</CardDescription>
                  </div>
                  <Badge variant={statusVariant(runStatus)}>{statusLabel(runStatus)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Selected Workload */}
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Selected Workload
                  </p>
                  <p className="font-mono text-sm truncate">{selectedWorkloadID || "None selected"}</p>
                </div>

                {/* Test Input */}
                <Textarea
                  value={testInput}
                  onChange={(event) => setTestInput(event.target.value)}
                  placeholder="Enter test input..."
                  className="min-h-[80px]"
                />

                {/* Run Button */}
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => void runSelectedWorkload()}
                  disabled={runStatus === "loading" || !selectedWorkloadID}
                >
                  {runStatus === "loading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Run Workload
                </Button>

                {/* Error Display */}
                {runError && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    {runError}
                  </div>
                )}

                {/* Results */}
                {runResult && (
                  <>
                    <div className="h-px bg-border" />

                    {/* Selected Provider */}
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Selected Provider
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-700">
                          <Check className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">{runResult.selected_provider.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Score: {runResult.selected_provider.total_score.toFixed(4)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Optimization Applied */}
                    {runResult.optimization && (
                      <div className="rounded-lg border border-border p-4 bg-amber-50">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          Optimization Applied
                        </p>
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="capitalize">
                            {runResult.optimization.profile}
                          </Badge>
                          <span className="text-sm font-medium text-green-600">
                            ~{runResult.optimization.projected_savings_pct}% savings
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Ranking */}
                    {runResult.rankings?.length > 0 && (
                      <div className="rounded-lg border border-border p-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                          Provider Ranking
                        </p>
                        <div className="space-y-3">
                          {runResult.rankings.map((item, index) => {
                            const width = clamp(Math.round(item.total_score * 100), 0, 100);
                            return (
                              <div key={item.name}>
                                <div className="flex items-center justify-between text-sm mb-1">
                                  <span className="flex items-center gap-2">
                                    <span className="text-muted-foreground">{index + 1}.</span>
                                    <span className="font-medium">{item.name}</span>
                                  </span>
                                  <span className="text-muted-foreground">{item.total_score.toFixed(3)}</span>
                                </div>
                                <div className="h-2 rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${width}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Response Preview */}
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Response
                      </p>
                      <pre className="max-h-[200px] overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 font-mono">
                        {responsePreview || "No response data"}
                      </pre>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-white mt-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
                <Zap className="h-3 w-3 text-white" />
              </div>
              <span className="font-medium">Infetrix</span>
              <span className="text-muted-foreground text-sm">· Intelligent Model Routing</span>
            </div>
            <p className="text-sm text-muted-foreground">Built for developers who want faster, cheaper AI inference.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
