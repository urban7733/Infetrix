"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Braces,
  Cpu,
  Gauge,
  Loader2,
  Rocket,
  Server,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MaxDeploymentPlan, OptimizationProfile } from "@/lib/optimizer";

type RunStatus = "idle" | "loading" | "error";

function statusLabel(status: RunStatus): string {
  if (status === "loading") return "Generating";
  if (status === "error") return "Error";
  return "Ready";
}

function statusVariant(status: RunStatus): "default" | "secondary" | "destructive" {
  if (status === "loading") return "secondary";
  if (status === "error") return "destructive";
  return "default";
}

function profileSummary(profile: OptimizationProfile): string {
  if (profile === "baseline") return "Baseline MAX serve config.";
  if (profile === "aggressive") return "Highest savings target, keep speculative paths gated.";
  return "Best default for production rollouts.";
}

function codeClassName() {
  return "overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-100";
}

export default function Home() {
  const [model, setModel] = useState("llama-3.1-8b-instruct");
  const [modelPath, setModelPath] = useState("/models/llama-3.1-8b-instruct-q4-k");
  const [profile, setProfile] = useState<OptimizationProfile>("tuned");
  const [port, setPort] = useState(8000);
  const [plan, setPlan] = useState<MaxDeploymentPlan | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState("");

  const requestExample = useMemo(
    () =>
      JSON.stringify(
        {
          model,
          model_path: modelPath,
          profile,
          port,
        },
        null,
        2,
      ),
    [model, modelPath, profile, port],
  );

  async function generatePlan(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    setError("");
    setStatus("loading");
    try {
      const response = await fetch("/v1/deploy-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.trim(),
          model_path: modelPath.trim(),
          profile,
          port,
        }),
      });

      const data = (await response.json()) as MaxDeploymentPlan & { error?: string };
      if (!response.ok) {
        setStatus("error");
        setError(data.error || "Failed to generate deployment plan.");
        return;
      }

      setPlan(data);
      setStatus("idle");
    } catch (requestError) {
      setStatus("error");
      setError(requestError instanceof Error ? requestError.message : "Failed to generate deployment plan.");
    }
  }

  useEffect(() => {
    void generatePlan();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <header className="sticky top-0 z-50 border-b border-border bg-white/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-semibold">Infetrix</p>
              <p className="text-xs text-muted-foreground">API-first MAX inference optimization</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">Beta</Badge>
            <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <section className="grid gap-8 border-b border-border pb-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Mojo / MAX</Badge>
              <Badge variant="outline">No provider keys in the request path</Badge>
              <Badge variant="outline">API-first</Badge>
            </div>
            <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Deploy optimized model serving once.
              <br />
              <span className="text-muted-foreground">Keep the product surface small.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Infetrix should not ask every user to wire RunPod, Modal, and Hugging Face by hand. The easier path is
              to deploy a tuned MAX backend, benchmark it, and use Infetrix as the control-plane API around that
              optimized runtime.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Cpu className="h-4 w-4" />
                Savings target
              </div>
              <p className="text-2xl font-semibold">30-40%</p>
              <p className="mt-1 text-sm text-muted-foreground">From quantization, batching, and cache-aware serving.</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
                Key model
              </div>
              <p className="text-2xl font-semibold">Self-hosted</p>
              <p className="mt-1 text-sm text-muted-foreground">No provider API keys need to ride with every request.</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Rocket className="h-4 w-4" />
                Product focus
              </div>
              <p className="text-2xl font-semibold">Control plane</p>
              <p className="mt-1 text-sm text-muted-foreground">Generate the serving plan and keep the public API simple.</p>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>Generate MAX Deployment Plan</CardTitle>
              <CardDescription>Only the inputs you actually need: model, path, profile, and port.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" onSubmit={generatePlan}>
                <div className="space-y-3">
                  <label className="text-sm font-medium">Model</label>
                  <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="llama-3.1-8b-instruct" />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">Model Path</label>
                  <Input
                    value={modelPath}
                    onChange={(event) => setModelPath(event.target.value)}
                    placeholder="/models/llama-3.1-8b-instruct-q4-k"
                  />
                  <p className="text-xs text-muted-foreground">
                    This is the quantized or tuned artifact you serve with MAX.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">Optimization Profile</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["baseline", "tuned", "aggressive"] as OptimizationProfile[]).map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant={profile === value ? "default" : "outline"}
                        onClick={() => setProfile(value)}
                        className="capitalize"
                      >
                        {value}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{profileSummary(profile)}</p>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">Serve Port</label>
                  <Input type="number" min="1" value={port} onChange={(event) => setPort(Number(event.target.value))} />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">Control Plane API Request</label>
                  <Textarea readOnly value={requestExample} className="min-h-[144px] font-mono text-xs" />
                </div>

                {error ? <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

                <Button type="submit" size="lg" className="w-full" disabled={status === "loading"}>
                  {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Terminal className="h-4 w-4" />}
                  Generate Plan
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle>Plan Output</CardTitle>
                <CardDescription>Serve, warm-cache, benchmark, compare. Nothing extra.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {plan ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-2xl border border-border bg-slate-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Projected Savings</p>
                        <p className="mt-2 text-2xl font-semibold">{plan.projected_savings_pct}%</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-slate-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latency Delta</p>
                        <p className="mt-2 text-2xl font-semibold">-{plan.projected_latency_reduction_pct}%</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-slate-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Memory Utilization</p>
                        <p className="mt-2 text-2xl font-semibold">{plan.config.device_memory_utilization}</p>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-medium">Environment</p>
                      <pre className={codeClassName()}>{`export MODEL_ID="${plan.env.MODEL_ID}"
export MODEL_PATH="${plan.env.MODEL_PATH}"
export PORT="${plan.env.PORT}"`}</pre>
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-medium">Serve Command</p>
                      <pre className={codeClassName()}>{plan.commands.serve}</pre>
                    </div>

                    <div className="grid gap-4">
                      <div>
                        <p className="mb-2 text-sm font-medium">Warm Cache</p>
                        <pre className={codeClassName()}>{plan.commands.warm_cache}</pre>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-medium">Baseline Benchmark</p>
                        <pre className={codeClassName()}>{plan.commands.baseline_benchmark}</pre>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-medium">Optimized Benchmark</p>
                        <pre className={codeClassName()}>{plan.commands.optimized_benchmark}</pre>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-medium">Compare Results</p>
                        <pre className={codeClassName()}>{plan.commands.compare}</pre>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-slate-50 p-8 text-sm text-muted-foreground">
                    Generate a plan to see the MAX runtime commands.
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border/80 shadow-sm">
                <CardHeader>
                  <CardTitle>Why This Is Simpler</CardTitle>
                  <CardDescription>Remove the product surface area you do not need.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <Server className="mt-0.5 h-4 w-4 text-primary" />
                    <p>One optimized serving stack is easier to operate than asking users to compare providers manually.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Gauge className="mt-0.5 h-4 w-4 text-primary" />
                    <p>Benchmarks decide whether a profile ships. The UI should not ask users to guess prices and latency.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Braces className="mt-0.5 h-4 w-4 text-primary" />
                    <p>Infrastructure credentials are only needed when you create the GPU deployment, not on every inference call.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 shadow-sm">
                <CardHeader>
                  <CardTitle>Control Plane API</CardTitle>
                  <CardDescription>Generate deployment plans programmatically from your own tooling.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <pre className={codeClassName()}>{`curl -X POST http://localhost:3000/v1/deploy-plan \\
  -H "Content-Type: application/json" \\
  -d '${requestExample}'`}</pre>

                  {plan ? (
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {plan.notes.map((note) => (
                        <div key={note} className="rounded-xl border border-border bg-slate-50 px-3 py-2">
                          {note}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
