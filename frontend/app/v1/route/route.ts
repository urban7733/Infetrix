import { NextResponse } from "next/server";
import {
  apiKeyPreview,
  parsePolicy,
  rankProviders,
  requestID,
  RouteRequest,
  validateProviderInput,
} from "@/lib/infetrix";

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RouteRequest;

    if (!body.model || !body.model.trim()) {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }

    validateProviderInput(body.providers, false);
    const policy = parsePolicy(body.policy, "balanced");
    const rankings = rankProviders(policy, body.providers);
    const selected = rankings[0];

    return NextResponse.json({
      request_id: requestID(),
      model: body.model,
      policy,
      selected_provider: {
        name: selected.provider.name,
        endpoint: selected.provider.endpoint,
        api_key_preview: apiKeyPreview(selected.provider.api_key),
        total_score: selected.total_score,
      },
      rankings: rankings.map((item) => ({
        name: item.provider.name,
        total_score: item.total_score,
        cost_score: item.cost_score,
        latency_score: item.latency_score,
        availability_score: item.availability_score,
        price_per_1k_tokens: asNumber(item.provider.price_per_1k_tokens),
        avg_latency_ms: asNumber(item.provider.avg_latency_ms),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
