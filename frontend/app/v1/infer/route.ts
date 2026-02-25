import { NextResponse } from "next/server";
import {
  apiKeyPreview,
  InferRequest,
  parsePolicy,
  rankProviders,
  requestID,
  validateDispatchEndpoint,
  validateProviderInput,
} from "@/lib/infetrix";

type DispatchResult = {
  status: number;
  body: unknown;
};

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

async function dispatchToProvider(payload: InferRequest, provider: InferRequest["providers"][number]): Promise<DispatchResult> {
  const name = provider.name.trim().toLowerCase();

  if (name === "runpod") {
    const runpodPayload = {
      model: payload.model,
      input: { prompt: payload.prompt },
      parameters: {
        max_tokens: pickMaxTokens(payload.max_tokens),
        temperature: pickTemperature(payload.temperature),
      },
    };

    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify(runpodPayload),
      cache: "no-store",
    });

    return { status: response.status, body: parseJSONMaybe(await response.text()) };
  }

  if (name === "huggingface" || name === "hugging_face" || name === "hf") {
    const hfPayload = {
      inputs: payload.prompt,
      parameters: {
        max_new_tokens: pickMaxTokens(payload.max_tokens),
        temperature: pickTemperature(payload.temperature),
      },
    };

    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify(hfPayload),
      cache: "no-store",
    });

    return { status: response.status, body: parseJSONMaybe(await response.text()) };
  }

  throw new Error(`no adapter for provider \"${provider.name}\"`);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InferRequest;

    if (!body.prompt || !body.prompt.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    if (!body.model || !body.model.trim()) {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }

    validateProviderInput(body.providers, true);
    for (const provider of body.providers) {
      validateDispatchEndpoint(provider.name, provider.endpoint);
    }
    const policy = parsePolicy(body.policy, "balanced");
    const rankings = rankProviders(policy, body.providers);
    const selected = rankings[0].provider;

    let providerResult: DispatchResult;
    try {
      providerResult = await dispatchToProvider(body, selected);
    } catch (error) {
      return NextResponse.json(
        {
          error: "provider dispatch failed",
          provider: selected.name,
          request_id: requestID(),
          selected_hint: apiKeyPreview(selected.api_key),
          detail: error instanceof Error ? error.message : "unknown error",
        },
        { status: 502 },
      );
    }

    const rid = requestID();
    if (providerResult.status < 200 || providerResult.status >= 300) {
      return NextResponse.json(
        {
          error: "provider returned non-2xx status",
          request_id: rid,
          provider: selected.name,
          provider_status: providerResult.status,
          provider_response: providerResult.body,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      request_id: rid,
      model: body.model,
      policy,
      selected_provider: {
        name: selected.name,
        endpoint: selected.endpoint,
        api_key_preview: apiKeyPreview(selected.api_key),
        total_score: rankings[0].total_score,
      },
      provider_status: providerResult.status,
      provider_response: providerResult.body,
      rankings: rankings.map((item) => ({
        name: item.provider.name,
        total_score: item.total_score,
        cost_score: item.cost_score,
        latency_score: item.latency_score,
        availability_score: item.availability_score,
        price_per_1k_tokens: item.provider.price_per_1k_tokens,
        avg_latency_ms: item.provider.avg_latency_ms,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
