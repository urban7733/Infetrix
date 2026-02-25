"use client";

import { FormEvent, useMemo, useState } from "react";
import { Activity, Cpu, Gauge, KeyRound, Loader2, Sparkles, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Mode = "route" | "infer";
type Policy = "balanced" | "cost" | "latency";
type StatusKind = "idle" | "loading" | "success" | "error";

type ProviderInput = {
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

type SelectedProvider = {
  name?: string;
  endpoint?: string;
  api_key_preview?: string;
  total_score?: number;
};

type RankingItem = {
  name: string;
  total_score: number;
  cost_score: number;
  latency_score: number;
  availability_score: number;
};

type APIData = {
  selected_provider?: SelectedProvider;
  rankings?: RankingItem[];
  provider_response?: unknown;
  error?: string;
};

const providerTemplates: ProviderInput[] = [
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

function cloneProviders(): ProviderInput[] {
  return providerTemplates.map((provider) => ({ ...provider }));
}

const statusBadge: Record<StatusKind, { variant: "secondary" | "warning" | "success" | "destructive"; text: string }> = {
  idle: { variant: "secondary", text: "Idle" },
  loading: { variant: "warning", text: "Running" },
  success: { variant: "success", text: "Success" },
  error: { variant: "destructive", text: "Failed" },
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function asNum(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export default function Home() {
  const [prompt, setPrompt] = useState("Write a concise 2-line launch note for Infetrix.");
  const [model, setModel] = useState("llama-3.1-8b-instruct");
  const [mode, setMode] = useState<Mode>("infer");
  const [policy, setPolicy] = useState<Policy>("balanced");
  const [maxTokens, setMaxTokens] = useState(128);
  const [temperature, setTemperature] = useState(0.7);
  const [providers, setProviders] = useState<ProviderInput[]>(() => cloneProviders());
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [status, setStatus] = useState<StatusKind>("idle");
  const [selected, setSelected] = useState<SelectedProvider | null>(null);
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [responsePreview, setResponsePreview] = useState("No response yet.");
  const [error, setError] = useState("");

  const activeProviders = useMemo(() => providers.filter((p) => p.enabled), [providers]);

  function updateProvider(id: ProviderInput["id"], patch: Partial<ProviderInput>) {
    setProviders((prev) => prev.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider)));
  }

  function resetDemo() {
    setPrompt("Write a concise 2-line launch note for Infetrix.");
    setModel("llama-3.1-8b-instruct");
    setMode("infer");
    setPolicy("balanced");
    setMaxTokens(128);
    setTemperature(0.7);
    setShowAdvanced(false);
    setProviders(cloneProviders());
    setStatus("idle");
    setSelected(null);
    setRankings([]);
    setError("");
    setResponsePreview("No response yet.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!prompt.trim() || !model.trim()) {
      setStatus("error");
      setError("Prompt and model are required.");
      return;
    }

    if (activeProviders.length === 0) {
      setStatus("error");
      setError("Enable at least one provider.");
      return;
    }

    if (mode === "infer") {
      const missingKey = activeProviders.find((provider) => !provider.apiKey.trim());
      if (missingKey) {
        setStatus("error");
        setError(`${missingKey.label}: API key is required for infer mode.`);
        return;
      }
    }

    const payloadProviders = activeProviders.map((provider) => ({
      name: provider.name,
      endpoint: provider.endpoint,
      api_key: provider.apiKey.trim(),
      price_per_1k_tokens: asNum(provider.price, 0.02),
      avg_latency_ms: Math.max(1, Math.floor(asNum(provider.latency, 350))),
      availability: clamp(asNum(provider.availability, 0.99), 0, 1),
    }));

    const payload: Record<string, unknown> = {
      prompt: prompt.trim(),
      model: model.trim(),
      policy,
      providers: payloadProviders,
    };

    if (mode === "infer") {
      payload.max_tokens = Math.max(1, Math.floor(asNum(maxTokens, 128)));
      payload.temperature = clamp(asNum(temperature, 0.7), 0, 2);
    }

    setStatus("loading");

    try {
      const response = await fetch(mode === "infer" ? "/api/infer" : "/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      const data = (text ? JSON.parse(text) : {}) as APIData;

      setSelected(data.selected_provider ?? null);
      setRankings(Array.isArray(data.rankings) ? data.rankings : []);

      if (mode === "infer") {
        setResponsePreview(JSON.stringify(data.provider_response ?? { note: "No provider response payload." }, null, 2));
      } else {
        setResponsePreview("Route mode: no provider dispatch executed.");
      }

      if (!response.ok) {
        setStatus("error");
        setError(typeof data.error === "string" ? data.error : "Request failed.");
        return;
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unexpected error.");
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="noise" />
      <div className="orb orb-left" />
      <div className="orb orb-right" />

      <div className="relative z-10 mx-auto w-full max-w-6xl space-y-6">
        <section className="glass hero-grid rounded-2xl p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="border-cyan-300/30 bg-cyan-400/10 text-cyan-100">
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Infetrix Control Surface
            </Badge>
            <Badge variant="secondary">Black Tech UI</Badge>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Cheaper inference. Faster decisions.</h1>
          <p className="mt-4 max-w-3xl text-sm text-muted-foreground sm:text-base">
            One compact workflow: write prompt, connect providers, run. Infetrix ranks endpoints in real time and sends
            the request to the best candidate for your current policy.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="glass shadow-glow">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Quick Run</CardTitle>
                  <CardDescription>Minimal flow, high control.</CardDescription>
                </div>
                <Badge variant={statusBadge[status].variant}>{statusBadge[status].text}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <p className="section-title">Prompt</p>
                  <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="section-title">Model</p>
                    <Input value={model} onChange={(event) => setModel(event.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <p className="section-title">Mode</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={mode === "infer" ? "default" : "outline"}
                        onClick={() => setMode("infer")}
                      >
                        <Activity className="mr-2 h-4 w-4" />
                        Infer
                      </Button>
                      <Button
                        type="button"
                        variant={mode === "route" ? "default" : "outline"}
                        onClick={() => setMode("route")}
                      >
                        <Gauge className="mr-2 h-4 w-4" />
                        Route
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="section-title">Policy</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["balanced", "cost", "latency"] as Policy[]).map((p) => (
                      <Button
                        key={p}
                        type="button"
                        variant={policy === p ? "default" : "outline"}
                        onClick={() => setPolicy(p)}
                        className="capitalize"
                      >
                        {p === "cost" ? <Wallet className="mr-2 h-4 w-4" /> : null}
                        {p === "latency" ? <Cpu className="mr-2 h-4 w-4" /> : null}
                        {p}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="section-title">Providers</p>
                  {providers.map((provider) => (
                    <div key={provider.id} className="rounded-xl border border-white/10 bg-black/35 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{provider.label}</p>
                          <p className="text-xs text-muted-foreground">{provider.endpoint}</p>
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
                        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                          <Input
                            type="password"
                            placeholder={`${provider.label} API key`}
                            value={provider.apiKey}
                            onChange={(event) => updateProvider(provider.id, { apiKey: event.target.value })}
                          />
                          <Badge variant="outline" className="h-10 self-stretch px-3 py-2 text-xs text-muted-foreground">
                            {provider.price.toFixed(3)}$/1k · {provider.latency}ms · {provider.availability}
                          </Badge>
                        </div>
                      ) : null}

                      {showAdvanced && provider.enabled ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <Input
                            type="number"
                            step="0.001"
                            value={provider.price}
                            onChange={(event) => updateProvider(provider.id, { price: Number(event.target.value) })}
                            placeholder="Price / 1k"
                          />
                          <Input
                            type="number"
                            value={provider.latency}
                            onChange={(event) => updateProvider(provider.id, { latency: Number(event.target.value) })}
                            placeholder="Latency ms"
                          />
                          <Input
                            type="number"
                            min="0"
                            max="1"
                            step="0.001"
                            value={provider.availability}
                            onChange={(event) => updateProvider(provider.id, { availability: Number(event.target.value) })}
                            placeholder="Availability"
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}

                  <Button type="button" variant="ghost" onClick={() => setShowAdvanced((prev) => !prev)}>
                    {showAdvanced ? "Hide advanced routing assumptions" : "Show advanced routing assumptions"}
                  </Button>
                </div>

                {mode === "infer" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="section-title">Max tokens</p>
                      <Input
                        type="number"
                        min="1"
                        value={maxTokens}
                        onChange={(event) => setMaxTokens(Number(event.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="section-title">Temperature</p>
                      <Input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={temperature}
                        onChange={(event) => setTemperature(Number(event.target.value))}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="lg" disabled={status === "loading"}>
                    {status === "loading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Run Infetrix
                  </Button>
                  <Button type="button" variant="outline" size="lg" onClick={resetDemo}>
                    Reset Demo
                  </Button>
                </div>

                {error ? <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
              </form>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader>
              <CardTitle>Decision Output</CardTitle>
              <CardDescription>Selected provider, scores, and provider response payload.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Selected Provider</p>
                {selected ? (
                  <>
                    <p className="mt-2 text-lg font-semibold">{selected.name ?? "-"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Score: {Number(selected.total_score ?? 0).toFixed(4)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Endpoint: {selected.endpoint ?? "n/a"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Key preview: {selected.api_key_preview ?? "n/a"}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No run yet.</p>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-white/10 bg-black/35 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Ranking</p>
                {rankings.length > 0 ? (
                  rankings.map((item) => {
                    const pct = clamp(Math.round(item.total_score * 100), 0, 100);
                    return (
                      <div key={item.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-foreground">{item.name}</span>
                          <span className="text-muted-foreground">{item.total_score.toFixed(4)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">No ranking data yet.</p>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-white/10 bg-black/35 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Provider Response</p>
                <pre className="max-h-[22rem] overflow-auto rounded-md bg-black/50 p-3 text-xs text-slate-200">{responsePreview}</pre>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
