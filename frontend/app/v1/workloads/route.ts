import { NextResponse } from "next/server";
import {
  apiKeyPreview,
  parsePolicy,
  ProviderRequest,
  rankProviders,
  requestID,
  validateDispatchEndpoint,
  validateProviderInput,
} from "@/lib/infetrix";
import { buildOptimizationPlan, OptimizationPlan, workloadProfilePreview } from "@/lib/optimizer";
import { Workload, WorkloadMode, workloadStore } from "@/lib/workloads-store";

type ExecuteResult = {
  request_id: string;
  workload_id: string;
  workload_name: string;
  model: string;
  mode: WorkloadMode;
  policy: string;
  optimization_plan: OptimizationPlan;
  selected_provider: {
    name: string;
    endpoint: string;
    api_key_preview: string;
    total_score: number;
  };
  rankings: Array<{
    name: string;
    total_score: number;
    cost_score: number;
    latency_score: number;
    availability_score: number;
    price_per_1k_tokens: number;
    avg_latency_ms: number;
  }>;
  provider_status?: number;
  provider_response?: unknown;
};

type DispatchResult = {
  status: number;
  body: unknown;
};

function nowISO(): string {
  return new Date().toISOString();
}

function newWorkloadID(): string {
  return `wl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function asFinite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseJSONMaybe(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function pickTemperature(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.7;
  if (n < 0 || n > 2) throw new Error("temperature must be between 0 and 2");
  return n;
}

function pickMaxTokens(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 256;
  return Math.floor(n);
}

function defaultProviders(): ProviderRequest[] {
  return [
    {
      name: "runpod",
      endpoint: "https://api.runpod.ai/v2/YOUR_ENDPOINT/runsync",
      api_key: "",
      price_per_1k_tokens: 0.024,
      avg_latency_ms: 420,
      availability: 0.992,
    },
    {
      name: "huggingface",
      endpoint: "https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-8B-Instruct",
      api_key: "",
      price_per_1k_tokens: 0.031,
      avg_latency_ms: 360,
      availability: 0.985,
    },
  ];
}

function workloadSummary(workload: Workload) {
  const rankings = rankProviders(workload.policy, workload.providers);
  const plan = buildOptimizationPlan(workload, rankings);

  return {
    id: workload.id,
    name: workload.name,
    model: workload.model,
    mode: workload.mode,
    policy: workload.policy,
    provider_count: workload.providers.length,
    workload_profile_preview: workloadProfilePreview(workload.workload_profile),
    traffic_profile: workload.traffic_profile,
    current_cost_per_1k: workload.current_cost_per_1k,
    projected_cost_per_1k: plan.projected_cost_per_1k,
    estimated_savings_percent: plan.estimated_savings_percent,
    active_levers: plan.active_levers.map((lever) => lever.title),
    budget_per_1k: workload.budget_per_1k,
    latency_sla_ms: workload.latency_sla_ms,
    created_at: workload.created_at,
    updated_at: workload.updated_at,
  };
}

async function dispatchToProvider(
  workload: Workload,
  provider: ProviderRequest,
  input: string,
  maxTokensOverride?: number,
  temperatureOverride?: number,
): Promise<DispatchResult> {
  const name = provider.name.trim().toLowerCase();
  const max_tokens = pickMaxTokens(maxTokensOverride ?? workload.max_tokens);
  const temperature = pickTemperature(temperatureOverride ?? workload.temperature);

  if (name === "runpod") {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify({
        model: workload.model,
        input: { prompt: input },
        parameters: { max_tokens, temperature },
      }),
      cache: "no-store",
    });

    return { status: response.status, body: parseJSONMaybe(await response.text()) };
  }

  if (name === "huggingface" || name === "hugging_face" || name === "hf") {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify({
        inputs: input,
        parameters: {
          max_new_tokens: max_tokens,
          temperature,
        },
      }),
      cache: "no-store",
    });

    return { status: response.status, body: parseJSONMaybe(await response.text()) };
  }

  throw new Error(`no adapter for provider "${provider.name}"`);
}

function buildCreatePayload(raw: Record<string, unknown>): Workload {
  const name = String(raw.name || "").trim();
  const model = String(raw.model || "").trim();
  const modeRaw = String(raw.mode || "route").trim().toLowerCase();

  if (!name) throw new Error("workload name is required");
  if (!model) throw new Error("model is required");

  const mode: WorkloadMode = modeRaw === "route" ? "route" : "infer";
  const policy = parsePolicy(typeof raw.policy === "string" ? raw.policy : undefined, "balanced");

  const providers = ((Array.isArray(raw.providers) ? raw.providers : defaultProviders()) as ProviderRequest[]).map((provider) => ({
    ...provider,
    name: String(provider.name || "").trim().toLowerCase(),
    endpoint: String(provider.endpoint || "").trim(),
    api_key: String(provider.api_key || "").trim(),
    price_per_1k_tokens: asFinite(provider.price_per_1k_tokens, 0.03),
    avg_latency_ms: pickMaxTokens(provider.avg_latency_ms),
    availability: Math.max(0, Math.min(asFinite(provider.availability, 0.99), 1)),
  }));

  validateProviderInput(providers, mode === "infer");
  for (const provider of providers) {
    validateDispatchEndpoint(provider.name, provider.endpoint);
  }

  const created_at = nowISO();

  return {
    id: newWorkloadID(),
    name,
    model,
    mode,
    policy,
    max_tokens: pickMaxTokens(raw.max_tokens),
    temperature: pickTemperature(raw.temperature),
    budget_per_1k: raw.budget_per_1k == null ? undefined : asFinite(raw.budget_per_1k, 0),
    current_cost_per_1k: raw.current_cost_per_1k == null ? undefined : asFinite(raw.current_cost_per_1k, 0.09),
    latency_sla_ms: raw.latency_sla_ms == null ? undefined : pickMaxTokens(raw.latency_sla_ms),
    workload_profile: typeof raw.workload_profile === "string" ? raw.workload_profile.trim() : "",
    traffic_profile: typeof raw.traffic_profile === "string" ? raw.traffic_profile.trim() : "",
    sample_input: typeof raw.sample_input === "string" ? raw.sample_input : "",
    providers,
    created_at,
    updated_at: created_at,
  };
}

async function executeWorkload(raw: Record<string, unknown>): Promise<ExecuteResult> {
  const workloadID = String(raw.workload_id || "").trim();
  if (!workloadID) throw new Error("workload_id is required");

  const workload = await workloadStore.get(workloadID);
  if (!workload) throw new Error("workload not found");

  const rankings = rankProviders(workload.policy, workload.providers);
  const top = rankings[0];
  const selected = top.provider;
  const optimizationPlan = buildOptimizationPlan(workload, rankings);

  const resultBase: ExecuteResult = {
    request_id: requestID(),
    workload_id: workload.id,
    workload_name: workload.name,
    model: workload.model,
    mode: workload.mode,
    policy: workload.policy,
    optimization_plan: optimizationPlan,
    selected_provider: {
      name: selected.name,
      endpoint: selected.endpoint,
      api_key_preview: apiKeyPreview(selected.api_key),
      total_score: top.total_score,
    },
    rankings: rankings.map((item) => ({
      name: item.provider.name,
      total_score: item.total_score,
      cost_score: item.cost_score,
      latency_score: item.latency_score,
      availability_score: item.availability_score,
      price_per_1k_tokens: item.provider.price_per_1k_tokens,
      avg_latency_ms: item.provider.avg_latency_ms,
    })),
  };

  if (workload.mode === "route") {
    return resultBase;
  }

  const input = String(raw.input || workload.sample_input || "").trim();
  if (!input) throw new Error("input is required to execute infer workload");

  let providerResult: DispatchResult;
  try {
    providerResult = await dispatchToProvider(
      workload,
      selected,
      input,
      raw.max_tokens as number | undefined,
      raw.temperature as number | undefined,
    );
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "provider dispatch failed");
  }

  return {
    ...resultBase,
    provider_status: providerResult.status,
    provider_response: providerResult.body,
  };
}

export async function GET() {
  const workloads = (await workloadStore.list()).map((workload) => workloadSummary(workload));

  return NextResponse.json({
    workloads,
    count: workloads.length,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "create").trim().toLowerCase();

    if (action === "create") {
      const workload = await workloadStore.create(buildCreatePayload(body));
      return NextResponse.json(
        {
          message: "workload created",
          workload: workloadSummary(workload),
        },
        { status: 201 },
      );
    }

    if (action === "delete") {
      const workloadID = String(body.workload_id || "").trim();
      if (!workloadID) {
        return NextResponse.json({ error: "workload_id is required" }, { status: 400 });
      }
      await workloadStore.delete(workloadID);
      return NextResponse.json({ message: "workload deleted", workload_id: workloadID });
    }

    if (action === "execute") {
      const result = await executeWorkload(body);

      if (result.provider_status && (result.provider_status < 200 || result.provider_status >= 300)) {
        return NextResponse.json(
          {
            error: "provider returned non-2xx status",
            ...result,
          },
          { status: 502 },
        );
      }

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `unsupported action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "invalid request body",
      },
      { status: 400 },
    );
  }
}
